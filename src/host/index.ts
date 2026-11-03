import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { SettingsNamespace, SettingsPathOp } from '@deepseek-ai/dsh-settings'
import {
  COOKIE_CREDENTIAL_REF,
  DEFAULT_REFRESH_INTERVAL_SECONDS,
  NO_AUTH_CREDENTIAL_REF,
  NO_AUTH_CREDENTIAL_VALUE,
  PLUGIN_NAME,
  SETTINGS_NAMESPACE,
  type CallableRouteConfig,
  type ConnectorSnapshot,
  type LoginRequest,
  type RefreshRequest,
  type RouteSummary,
  type SelectRouteRequest,
  type SelectedRouteView,
  type SetCredentialRequest,
} from '../shared/contracts.ts'
import { authCredential, authTransport, providerId, providerProfile, routeCredentialRef, selectedRoute } from '../shared/route-mapper.ts'
import { GatewayClient, GatewayHttpError } from './gateway-client.ts'

export interface Config {
  timeoutMs: number
  gatewayUrl: Volatile<string>
  username: Volatile<string>
  selectedRouteId: Volatile<string>
  providerId: Volatile<string>
  routeEtag: Volatile<string>
  autoRefresh: Volatile<boolean>
  refreshIntervalSeconds: Volatile<number>
}

export const Config = Schema.object({
  timeoutMs: Schema.number().default(10000),
  gatewayUrl: Schema.string().default('').volatile(),
  username: Schema.string().default('').volatile(),
  selectedRouteId: Schema.string().default('').volatile(),
  providerId: Schema.string().default('').volatile(),
  routeEtag: Schema.string().default('').volatile(),
  autoRefresh: Schema.boolean().default(false).volatile(),
  refreshIntervalSeconds: Schema.number().default(DEFAULT_REFRESH_INTERVAL_SECONDS).volatile(),
}) as unknown as Schema<Config>

interface PersistedState {
  gatewayUrl: string
  username: string
  selectedRouteId: string
  providerId: string
  routeEtag: string
  autoRefresh: boolean
  refreshIntervalSeconds: number
}

function optional(value: string): string | undefined {
  return value.trim() || undefined
}

function publicError(error: unknown): string {
  if (error instanceof GatewayHttpError) return error.message
  if (error instanceof Error) return error.message
  return 'gateway operation failed'
}

/** Host-owned connector. Secrets stay in ctx.credentials; the Remote face is redacted. */
export class HigressGatewayService extends TypertRemoteService {
  static inject = ['settings', 'credentials']
  static Config = Config

  private readonly credentials: {
    set: (ref: ReturnType<typeof credentialRef>, value: string) => Promise<void>
    resolve: (ref: ReturnType<typeof credentialRef>) => Promise<{ value: string } | undefined>
    unset: (ref: ReturnType<typeof credentialRef>) => Promise<void>
  }
  private readonly timeoutMs
  private readonly config: Config
  private readonly settingsEntry: SettingsNamespace
  private client?: GatewayClient
  private routes: RouteSummary[] = []
  private selectedConfig?: CallableRouteConfig
  private selected?: SelectedRouteView
  private statusValue: ConnectorSnapshot['status'] = 'DISCONNECTED'
  private lastRefreshAt?: number
  private lastError?: string
  private timer?: ReturnType<typeof setInterval>
  private operation: Promise<unknown> = Promise.resolve()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'higressGateway')
    this.config = config
    this.settingsEntry = 'higress-ai-route-host' as SettingsNamespace
    this.credentials = ctx.credentials
    this.timeoutMs = config.timeoutMs
    // The service class is the Loader entry's root plugin. Register the
    // presentation against that same fiber so SettingsForms can expose the
    // volatile connector state without introducing a nested, unaddressable
    // plugin entry.
    ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber), 'higress-ai-route: settings presentation')
    void this.restore()
    ctx.effect(() => () => this.stopTimer(), 'higress-ai-route: refresh timer')
  }

  /** Current connection and route state; never includes a password, cookie, or key. */
  @Remote('status')
  status(): ConnectorSnapshot {
    const value = this.state()
    return {
      status: this.statusValue,
      ...optional(value.gatewayUrl) === undefined ? {} : { gatewayUrl: value.gatewayUrl },
      ...optional(value.username) === undefined ? {} : { username: value.username },
      routes: this.routes.map(route => ({ ...route, models: [...route.models] })),
      ...this.selected === undefined ? {} : { selected: { ...this.selected } },
      autoRefresh: value.autoRefresh,
      refreshIntervalSeconds: value.refreshIntervalSeconds,
      ...this.lastRefreshAt === undefined ? {} : { lastRefreshAt: this.lastRefreshAt },
      ...this.lastError === undefined ? {} : { lastError: this.lastError },
    }
  }

  /** Login to the Console control plane and immediately load the user's routes. */
  @Remote('login')
  async login(request: LoginRequest): Promise<ConnectorSnapshot> {
    return this.serial(async () => {
      const client = new GatewayClient(request.gatewayUrl, { timeoutMs: this.timeoutMs })
      await client.login(request)
      const cookie = client.cookieHeader
      if (cookie === undefined) throw new Error('gateway login returned no session')
      await this.credentials.set(credentialRef(COOKIE_CREDENTIAL_REF), cookie)
      this.client = client
      await this.updateState({ gatewayUrl: client.baseUrl.toString().replace(/\/$/, ''), username: request.username, selectedRouteId: '', providerId: '', routeEtag: '' })
      this.routes = []
      this.selected = undefined
      this.selectedConfig = undefined
      this.lastError = undefined
      this.statusValue = 'CONNECTED'
      await this.refreshLocked({ force: true })
      return this.status()
    })
  }

  /** Logout clears the Console session and removes only this plugin's provider state. */
  @Remote('logout')
  async logout(): Promise<ConnectorSnapshot> {
    return this.serial(async () => {
      try { await this.client?.logout() } catch { /* local credentials are still cleared below */ }
      await this.credentials.unset(credentialRef(COOKIE_CREDENTIAL_REF))
      await this.removeOwnedProvider()
      this.stopTimer()
      await this.replaceState({
        gatewayUrl: '', username: '', selectedRouteId: '', providerId: '', routeEtag: '',
        autoRefresh: this.state().autoRefresh,
        refreshIntervalSeconds: this.state().refreshIntervalSeconds,
      })
      this.client = undefined
      this.routes = []
      this.selected = undefined
      this.selectedConfig = undefined
      this.statusValue = 'DISCONNECTED'
      this.lastError = undefined
      return this.status()
    })
  }

  /** Refresh route summaries and the selected route using ETag when possible. */
  @Remote('refresh')
  async refresh(request?: RefreshRequest): Promise<ConnectorSnapshot> {
    return this.serial(async () => {
      await this.refreshLocked(request ?? {})
      return this.status()
    })
  }

  /** Select one route from the user's current route list. */
  @Remote('selectRoute')
  async selectRoute(request: SelectRouteRequest): Promise<ConnectorSnapshot> {
    return this.serial(async () => {
      if (this.client === undefined) throw new Error('log in to a gateway before selecting a route')
      const summary = this.routes.find(route => route.routeId === request.routeId)
      if (summary === undefined) throw new Error('route is not present in the current gateway snapshot')
      await this.updateState({ selectedRouteId: request.routeId, routeEtag: '' })
      this.selected = undefined
      this.selectedConfig = undefined
      await this.syncSelected(summary.routeId, true)
      return this.status()
    })
  }

  /** Store a user-supplied existing BEARER credential, then retry the selected route. */
  @Remote('setRouteCredential')
  async setRouteCredential(request: SetCredentialRequest): Promise<ConnectorSnapshot> {
    return this.serial(async () => {
      const value = request.value.trim()
      if (value.length === 0) throw new Error('credential value cannot be empty')
      const config = await this.requireRoute(request.routeId)
      const transport = authTransport(config)
      if (transport !== 'BEARER') throw new Error('only BEARER route credentials can be entered in this release')
      const binding = authCredential(config)
      await this.credentials.set(credentialRef(routeCredentialRef(request.routeId, config.gateway.instanceId, binding?.credentialId)), value)
      if (this.state().selectedRouteId === request.routeId) await this.syncSelected(request.routeId, true)
      return this.status()
    })
  }

  /** Enable/disable background ETag refresh without exposing a secret. */
  @Remote('setAutoRefresh')
  async setAutoRefresh(enabled: boolean, intervalSeconds?: number): Promise<ConnectorSnapshot> {
    return this.serial(async () => {
      const interval = Math.max(15, Math.min(3600, Math.floor(intervalSeconds ?? DEFAULT_REFRESH_INTERVAL_SECONDS)))
      await this.updateState({ autoRefresh: enabled, refreshIntervalSeconds: interval })
      this.scheduleTimer()
      return this.status()
    })
  }

  private async restore(): Promise<void> {
    const persisted = this.state()
    if (optional(persisted.gatewayUrl) === undefined) return
    try {
      const cookie = await this.credentials.resolve(credentialRef(COOKIE_CREDENTIAL_REF))
      if (cookie === undefined) return
      this.client = new GatewayClient(persisted.gatewayUrl, { timeoutMs: this.timeoutMs })
      this.client.setCookieHeader(cookie.value)
      this.statusValue = 'CONNECTED'
      this.scheduleTimer()
      await this.refreshLocked({ force: false })
    } catch (error) {
      this.statusValue = 'REAUTH_REQUIRED'
      this.lastError = publicError(error)
    }
  }

  private async refreshLocked(request: RefreshRequest): Promise<void> {
    if (this.client === undefined) throw new Error('log in to a gateway before refreshing')
    try {
      const listed = await this.client.listRoutes()
      this.routes = listed.value
      const routeId = optional(this.state().selectedRouteId)
      if (routeId === undefined) {
        this.statusValue = 'CONNECTED'
      } else {
        await this.syncSelected(routeId, request.force === true)
      }
      this.lastRefreshAt = Date.now()
      this.lastError = undefined
      this.scheduleTimer()
    } catch (error) {
      this.lastError = publicError(error)
      if (error instanceof GatewayHttpError && error.code === 'REAUTH_REQUIRED') this.statusValue = 'REAUTH_REQUIRED'
      else if (this.selected !== undefined) this.statusValue = 'SYNC_DEGRADED'
      throw error
    }
  }

  private async syncSelected(routeId: string, force: boolean): Promise<void> {
    if (this.client === undefined) throw new Error('log in to a gateway before selecting a route')
    const persisted = this.state()
    const etag = force ? undefined : optional(persisted.routeEtag)
    let fetched = await this.client.getRoute(routeId, etag)
    if (fetched.notModified && this.selectedConfig === undefined) fetched = await this.client.getRoute(routeId)
    if (!fetched.notModified && fetched.value !== undefined) this.selectedConfig = fetched.value
    const config = this.selectedConfig
    if (config === undefined) throw new Error('gateway returned no route configuration')
    const binding = authCredential(config)
    const credentialRefValue = routeCredentialRef(routeId, config.gateway.instanceId, binding?.credentialId)
    const transport = authTransport(config)
    const selected = selectedRoute(config, transport === 'BEARER' ? credentialRefValue : undefined)
    this.selected = selected
    if (!selected.connectable) {
      this.statusValue = 'ROUTE_UNAVAILABLE'
      this.lastError = selected.reasonMessage ?? 'route is not connectable by this plugin'
      return
    }
    if (transport === 'BEARER') {
      const credential = await this.credentials.resolve(credentialRef(credentialRefValue))
      if (credential === undefined) {
        this.statusValue = 'CREDENTIAL_REQUIRED'
        return
      }
    } else if (transport === 'NONE') {
      const existing = await this.credentials.resolve(credentialRef(NO_AUTH_CREDENTIAL_REF))
      if (existing === undefined) await this.credentials.set(credentialRef(NO_AUTH_CREDENTIAL_REF), NO_AUTH_CREDENTIAL_VALUE)
    }
    await this.writeProvider(config, selected)
    this.statusValue = 'READY'
    await this.updateState({
      providerId: selected.provider,
      routeEtag: fetched.etag ?? persisted.routeEtag,
    })
  }

  private async writeProvider(config: CallableRouteConfig, selected: SelectedRouteView): Promise<void> {
    const settings = this.ctx.settings
    const ns = 'llm-pi-ai'
    const profile = providerProfile(config, selected.credentialRef)
    const previous = optional(this.state().providerId)
    const ops: SettingsPathOp[] = [
      { op: 'set', path: ['providers', selected.provider], value: profile },
    ]
    if (previous !== undefined && previous !== selected.provider) ops.push({ op: 'unset', path: ['providers', previous] })
    await settings.mutate(ns, ops)
  }

  private async removeOwnedProvider(): Promise<void> {
    const previous = optional(this.state().providerId)
    if (previous === undefined) return
    try {
      await this.ctx.settings.mutate('llm-pi-ai', [{ op: 'unset', path: ['providers', previous] }])
    } catch {
      // The official adapter may be absent in a minimal profile. Disconnecting
      // still clears this plugin's state and never removes another namespace.
    }
  }

  private async requireRoute(routeId: string): Promise<CallableRouteConfig> {
    if (this.client === undefined) throw new Error('log in to a gateway before configuring a route')
    const fetched = await this.client.getRoute(routeId)
    if (fetched.value === undefined) throw new Error('gateway returned no route configuration')
    return fetched.value
  }

  private scheduleTimer(): void {
    this.stopTimer()
    const persisted = this.state()
    if (!persisted.autoRefresh || this.client === undefined) return
    this.timer = setInterval(() => {
      void this.serial(async () => {
        try { await this.refreshLocked({ force: false }) } catch { /* state records the failure */ }
      })
    }, persisted.refreshIntervalSeconds * 1000)
  }

  private stopTimer(): void {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation)
    this.operation = next.then(() => undefined, () => undefined)
    return next
  }

  private state(): PersistedState {
    return {
      gatewayUrl: this.config.gatewayUrl.get(),
      username: this.config.username.get(),
      selectedRouteId: this.config.selectedRouteId.get(),
      providerId: this.config.providerId.get(),
      routeEtag: this.config.routeEtag.get(),
      autoRefresh: this.config.autoRefresh.get(),
      refreshIntervalSeconds: this.config.refreshIntervalSeconds.get(),
    }
  }

  private updateState(patch: Partial<PersistedState>): Promise<void> {
    return this.ctx.settings.update(this.settingsEntry, patch)
  }

  private replaceState(section: PersistedState): Promise<void> {
    return this.ctx.settings.replace(this.settingsEntry, section)
  }
}

export const name = PLUGIN_NAME
export const inject = ['settings', 'credentials']

export function apply(ctx: Context, config: Config): void {
  ctx.plugin(HigressGatewayService, config)
}

export default HigressGatewayService
