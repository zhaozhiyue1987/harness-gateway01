import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import remoteContribution from '../remote.ts'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  PLUGIN_NAME,
  SETTINGS_NAMESPACE,
  type ConnectorSnapshot,
  type LoginRequest,
  type SetCredentialRequest,
} from '../shared/contracts.ts'

const NS = 'settings.higressAiRoute'

export const zh = {
  name: 'Higress AI 路由',
  description: '登录网关并把一个可调用 AI 路由同步到 Harness。',
  gatewayUrl: '网关管理地址',
  gatewayHint: '支持私有化地址和反向代理路径前缀，例如 http://127.0.0.1:8001/console。',
  username: '用户名',
  password: '密码',
  showPassword: '显示密码',
  hidePassword: '隐藏密码',
  login: '登录并读取路由',
  logout: '退出登录',
  refresh: '刷新路由',
  select: '使用此路由',
  selected: '当前路由',
  selectedRoute: '当前路由配置',
  endpoint: '调用地址',
  modelId: '模型 ID',
  authentication: '认证方式',
  bearer: 'BEARER',
  credential: 'BEARER 凭证',
  credentialHint: '首次使用该路由时输入已有凭证；插件不会创建网关凭证。',
  saveCredential: '保存凭证并连接',
  autoRefresh: '自动刷新',
  autoRefreshHint: '后台配置变化后，自动同步当前路由。',
  enabled: '已开启',
  disabled: '已关闭',
  interval: '刷新间隔（秒）',
  apply: '应用',
  seconds: '秒',
  lastRefresh: '最近同步',
  routeCount: '个可用路由',
  emptyHint: '请刷新路由列表，或检查网关侧是否已发布可调用路由。',
  route: '路由',
  protocol: '协议',
  models: '模型',
  status: '状态',
  ready: '已就绪',
  connected: '已连接',
  credentialRequired: '需要凭证',
  unavailable: '不可连接',
  disconnected: '未连接',
  reauth: '需要重新登录',
  syncDegraded: '同步异常',
  loading: '处理中…',
  empty: '暂无可用路由',
  error: '操作失败',
  noAuth: '无认证',
}

export const en = {
  name: 'Higress AI routes',
  description: 'Sign in to a gateway and sync one callable AI route to Harness.',
  gatewayUrl: 'Gateway management URL',
  gatewayHint: 'Private gateway URLs and reverse-proxy path prefixes are supported, for example http://127.0.0.1:8001/console.',
  username: 'Username',
  password: 'Password',
  showPassword: 'Show password',
  hidePassword: 'Hide password',
  login: 'Sign in and load routes',
  logout: 'Sign out',
  refresh: 'Refresh routes',
  select: 'Use this route',
  selected: 'Selected route',
  selectedRoute: 'Selected route configuration',
  endpoint: 'Endpoint',
  modelId: 'Model ID',
  authentication: 'Authentication',
  bearer: 'BEARER',
  credential: 'BEARER credential',
  credentialHint: 'Enter the existing route credential once; the plugin never creates a gateway credential.',
  saveCredential: 'Save credential and connect',
  autoRefresh: 'Auto refresh',
  autoRefreshHint: 'Keep the selected route in sync when gateway configuration changes.',
  enabled: 'On',
  disabled: 'Off',
  interval: 'Refresh interval (seconds)',
  apply: 'Apply',
  seconds: 'seconds',
  lastRefresh: 'Last synced',
  routeCount: 'callable routes',
  emptyHint: 'Refresh the list, or check that a callable route is published in the gateway.',
  route: 'Route',
  protocol: 'Protocol',
  models: 'Models',
  status: 'Status',
  ready: 'Ready',
  connected: 'Connected',
  credentialRequired: 'Credential required',
  unavailable: 'Unavailable',
  disconnected: 'Disconnected',
  reauth: 'Sign-in required',
  syncDegraded: 'Sync degraded',
  loading: 'Working…',
  empty: 'No callable routes',
  error: 'Operation failed',
  noAuth: 'No authentication',
}

type Copy = typeof zh
type GatewayRemote = {
  status: () => Promise<ConnectorSnapshot>
  login: (request: LoginRequest) => Promise<ConnectorSnapshot>
  logout: () => Promise<ConnectorSnapshot>
  refresh: (request?: { force?: boolean }) => Promise<ConnectorSnapshot>
  selectRoute: (request: { routeId: string }) => Promise<ConnectorSnapshot>
  setRouteCredential: (request: SetCredentialRequest) => Promise<ConnectorSnapshot>
  setAutoRefresh: (enabled: boolean, intervalSeconds?: number) => Promise<ConnectorSnapshot>
}

type RawRemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string } }

type RawGatewayRemote = {
  status: () => Promise<RawRemoteResult<ConnectorSnapshot>>
  login: (request: LoginRequest) => Promise<RawRemoteResult<ConnectorSnapshot>>
  logout: () => Promise<RawRemoteResult<ConnectorSnapshot>>
  refresh: (request?: { force?: boolean }) => Promise<RawRemoteResult<ConnectorSnapshot>>
  selectRoute: (request: { routeId: string }) => Promise<RawRemoteResult<ConnectorSnapshot>>
  setRouteCredential: (request: SetCredentialRequest) => Promise<RawRemoteResult<ConnectorSnapshot>>
  setAutoRefresh: (enabled: boolean, intervalSeconds?: number) => Promise<RawRemoteResult<ConnectorSnapshot>>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.higressAiRoute': keyof Copy
  }
}

export const inject = ['remote']

async function unwrap<T>(operation: () => Promise<RawRemoteResult<T>>): Promise<T> {
  const result = await operation()
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

function statusText(status: ConnectorSnapshot['status'], t: (key: keyof Copy) => string): string {
  switch (status) {
    case 'READY': return t('ready')
    case 'CONNECTED': return t('connected')
    case 'CREDENTIAL_REQUIRED': return t('credentialRequired')
    case 'SYNC_DEGRADED': return t('syncDegraded')
    case 'ROUTE_UNAVAILABLE': return t('unavailable')
    case 'REAUTH_REQUIRED': return t('reauth')
    default: return t('disconnected')
  }
}

type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

function statusTone(status: ConnectorSnapshot['status']): StatusTone {
  switch (status) {
    case 'READY': return 'success'
    case 'CONNECTED': return 'info'
    case 'CREDENTIAL_REQUIRED':
    case 'SYNC_DEGRADED': return 'warning'
    case 'ROUTE_UNAVAILABLE':
    case 'REAUTH_REQUIRED': return 'danger'
    default: return 'neutral'
  }
}

function routeTone(status: string): StatusTone {
  const normalized = status.toUpperCase()
  if (normalized.includes('ERROR') || normalized.includes('UNAVAILABLE') || normalized.includes('DISABLED')) return 'danger'
  if (normalized.includes('WARN') || normalized.includes('DEGRADED')) return 'warning'
  if (normalized.includes('READY') || normalized.includes('ACTIVE') || normalized.includes('ENABLED') || normalized === 'OK') return 'success'
  return 'neutral'
}

function formatTimestamp(value?: number): string | undefined {
  if (value === undefined) return undefined
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(value)
  } catch {
    return undefined
  }
}

function StatusIndicator({ status, t }: { status: ConnectorSnapshot['status']; t: (key: keyof Copy) => string }): ReactNode {
  const tone = statusTone(status)
  return (
    <span style={styles.statusIndicator}>
      <span aria-hidden="true" style={{ ...styles.statusDot, background: toneColors[tone] }} />
      <span>{statusText(status, t)}</span>
    </span>
  )
}

function GatewayPanel({ remote, t }: { remote: GatewayRemote; t: (key: keyof Copy) => string }): ReactNode {
  const [snapshot, setSnapshot] = useState<ConnectorSnapshot>()
  const [gatewayUrl, setGatewayUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [credential, setCredential] = useState('')
  const [refreshInterval, setRefreshInterval] = useState('60')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const run = async (operation: () => Promise<ConnectorSnapshot>, clearPassword = false): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const next = await operation()
      setSnapshot(next)
      setRefreshInterval(String(next.refreshIntervalSeconds))
      if (clearPassword) setPassword('')
      if (clearPassword) setShowPassword(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error'))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let live = true
    void remote.status().then((next) => {
      if (!live) return
      setSnapshot(next)
      setRefreshInterval(String(next.refreshIntervalSeconds))
      if (next.gatewayUrl !== undefined) setGatewayUrl(next.gatewayUrl)
      if (next.username !== undefined) setUsername(next.username)
    }).catch(() => undefined)
    return () => { live = false }
  }, [remote])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    void run(() => remote.login({ gatewayUrl, username, password }), true)
  }
  const selected = snapshot?.selected
  const needsCredential = snapshot?.status === 'CREDENTIAL_REQUIRED' && selected?.authTransport === 'BEARER'
  const interval = Number.isFinite(Number(refreshInterval))
    ? Math.max(15, Math.min(3600, Math.floor(Number(refreshInterval))))
    : snapshot?.refreshIntervalSeconds ?? 60
  const connected = snapshot !== undefined && snapshot.status !== 'DISCONNECTED'

  const applyRefreshSettings = (): void => {
    if (snapshot === undefined) return
    setRefreshInterval(String(interval))
    void run(() => remote.setAutoRefresh(snapshot.autoRefresh, interval))
  }

  return (
    <section style={styles.section} aria-busy={busy} aria-labelledby="higress-ai-route-heading">
      <header>
        <h3 id="higress-ai-route-heading" style={styles.heading}>{t('name')}</h3>
        <p style={styles.description}>{t('description')}</p>
      </header>
      <form onSubmit={submit} style={styles.card}>
        <div style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="higress-gateway-url" style={styles.label}>{t('gatewayUrl')}</label>
            <input id="higress-gateway-url" style={styles.input} type="url" required value={gatewayUrl} onChange={event => setGatewayUrl(event.currentTarget.value)} placeholder="https://gateway.example" autoComplete="url" />
            <p style={styles.helper}>{t('gatewayHint')}</p>
          </div>
          <div style={styles.field}>
            <label htmlFor="higress-gateway-username" style={styles.label}>{t('username')}</label>
            <input id="higress-gateway-username" style={styles.input} required value={username} onChange={event => setUsername(event.currentTarget.value)} autoComplete="username" />
          </div>
          <div style={styles.field}>
            <label htmlFor="higress-gateway-password" style={styles.label}>{t('password')}</label>
            <div style={styles.inputWithAction}>
              <input id="higress-gateway-password" style={{ ...styles.input, flex: 1 }} type={showPassword ? 'text' : 'password'} required value={password} onChange={event => setPassword(event.currentTarget.value)} autoComplete="current-password" />
              <button type="button" style={styles.inlineButton} onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? t('hidePassword') : t('showPassword')}>
                {showPassword ? t('hidePassword') : t('showPassword')}
              </button>
            </div>
          </div>
        </div>
        <div style={styles.actions}>
          <button type="submit" style={styles.primaryButton} disabled={busy}>{busy ? t('loading') : t('login')}</button>
          {connected ? <button type="button" style={styles.secondaryButton} disabled={busy} onClick={() => { void run(() => remote.refresh({ force: true })) }}>{t('refresh')}</button> : null}
          {connected ? <button type="button" style={styles.ghostButton} disabled={busy} onClick={() => { void run(() => remote.logout()) }}>{t('logout')}</button> : null}
        </div>
      </form>
      {error !== undefined ? <p role="alert" style={styles.error}>{error}</p> : null}
      {snapshot !== undefined ? (
        <div style={styles.statusBar} role="status" aria-live="polite">
          <StatusIndicator status={snapshot.status} t={t} />
          {snapshot.lastRefreshAt !== undefined ? <span style={styles.muted}>{t('lastRefresh')} {formatTimestamp(snapshot.lastRefreshAt) ?? '—'}</span> : null}
        </div>
      ) : null}
      {snapshot?.lastError !== undefined ? <p role="alert" style={styles.error}>{snapshot.lastError}</p> : null}
      {snapshot !== undefined && snapshot.routes.length === 0 && connected ? (
        <div style={styles.emptyState}>
          <strong>{t('empty')}</strong>
          <span style={styles.muted}>{t('emptyHint')}</span>
          <button type="button" style={styles.secondaryButton} disabled={busy} onClick={() => { void run(() => remote.refresh({ force: true })) }}>{t('refresh')}</button>
        </div>
      ) : null}
      {snapshot !== undefined && snapshot.routes.length > 0 ? (
        <section style={styles.routes} aria-labelledby="higress-route-list-heading">
          <div style={styles.sectionHeading}>
            <h4 id="higress-route-list-heading" style={styles.subheading}>{t('route')}</h4>
            <span style={styles.muted}>{snapshot.routes.length} {t('routeCount')}</span>
          </div>
          {snapshot.routes.map(route => (
            <article key={route.routeId} style={{ ...styles.route, ...(selected?.routeId === route.routeId ? styles.routeSelected : {}) }} data-route-id={route.routeId} aria-current={selected?.routeId === route.routeId ? 'true' : undefined}>
              <div style={styles.routeMain}>
                <div style={styles.routeTitle}><strong>{route.name || route.routeId}</strong><span style={styles.routeId}>{route.routeId}</span></div>
                <span style={{ ...styles.statusTag, color: toneColors[routeTone(route.status)] }}>{route.status}</span>
              </div>
              <dl style={styles.details}>
                <div><dt style={styles.detailLabel}>{t('protocol')}</dt><dd style={styles.detailValue}>{route.protocol}</dd></div>
                <div><dt style={styles.detailLabel}>{t('models')}</dt><dd style={styles.detailValue}>{route.models.length > 0 ? route.models.join(', ') : '—'}</dd></div>
                <div><dt style={styles.detailLabel}>{t('authentication')}</dt><dd style={styles.detailValue}>{route.authRequired ? t('credentialRequired') : t('noAuth')}</dd></div>
              </dl>
              <button type="button" style={selected?.routeId === route.routeId ? styles.selectedButton : styles.secondaryButton} disabled={busy || selected?.routeId === route.routeId} onClick={() => { void run(() => remote.selectRoute({ routeId: route.routeId })) }}>{selected?.routeId === route.routeId ? t('selected') : t('select')}</button>
            </article>
          ))}
        </section>
      ) : null}
      {selected !== undefined ? (
        <section style={styles.selectedCard} aria-labelledby="higress-selected-route-heading">
          <h4 id="higress-selected-route-heading" style={styles.subheading}>{t('selectedRoute')}</h4>
          <dl style={styles.details}>
            <div><dt style={styles.detailLabel}>{t('route')}</dt><dd style={styles.detailValue}>{selected.name}</dd></div>
            <div><dt style={styles.detailLabel}>{t('endpoint')}</dt><dd style={{ ...styles.detailValue, ...styles.breakWord }}>{selected.baseUrl}</dd></div>
            <div><dt style={styles.detailLabel}>{t('modelId')}</dt><dd style={styles.detailValue}>{selected.model}</dd></div>
            <div><dt style={styles.detailLabel}>{t('authentication')}</dt><dd style={styles.detailValue}>{selected.authTransport === 'NONE' ? t('noAuth') : selected.authTransport}</dd></div>
          </dl>
        </section>
      ) : null}
      {needsCredential ? (
        <form onSubmit={(event) => { event.preventDefault(); void run(() => remote.setRouteCredential({ routeId: selected.routeId, value: credential }), false).then(() => setCredential('')) }} style={styles.card}>
          <div style={styles.field}>
            <label htmlFor="higress-route-credential" style={styles.label}>{t('credential')}</label>
            <input id="higress-route-credential" style={styles.input} type="password" value={credential} onChange={event => setCredential(event.currentTarget.value)} autoComplete="off" />
            <p style={styles.helper}>{t('credentialHint')}</p>
          </div>
          <button type="submit" style={styles.primaryButton} disabled={busy || credential.trim().length === 0}>{busy ? t('loading') : t('saveCredential')}</button>
        </form>
      ) : null}
      {connected ? (
        <section style={styles.card} aria-labelledby="higress-auto-refresh-heading">
          <div style={styles.refreshHeader}>
            <div>
              <h4 id="higress-auto-refresh-heading" style={styles.subheading}>{t('autoRefresh')}</h4>
              <p style={styles.helper}>{t('autoRefreshHint')}</p>
            </div>
            <label style={styles.toggle}><input type="checkbox" checked={snapshot.autoRefresh} disabled={busy} onChange={event => { void run(() => remote.setAutoRefresh(event.currentTarget.checked, interval)) }} /><span>{snapshot.autoRefresh ? t('enabled') : t('disabled')}</span></label>
          </div>
          <div style={styles.intervalRow}>
            <label htmlFor="higress-refresh-interval" style={styles.label}>{t('interval')}</label>
            <div style={styles.intervalControls}>
              <input id="higress-refresh-interval" style={styles.numberInput} type="number" min={15} max={3600} step={1} value={refreshInterval} onChange={event => setRefreshInterval(event.currentTarget.value)} disabled={busy} />
              <span style={styles.muted}>{t('seconds')}</span>
              <button type="button" style={styles.secondaryButton} disabled={busy} onClick={applyRefreshSettings}>{t('apply')}</button>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  )
}

const toneColors: Record<StatusTone, string> = {
  success: 'var(--dsw-alias-state-success-primary)',
  warning: 'var(--dsw-alias-state-warn-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
  info: 'var(--dsw-alias-state-business-primary)',
  neutral: 'var(--dsw-alias-label-tertiary)',
}

const styles = {
  section: { display: 'grid', gap: 14, maxWidth: 760, color: 'var(--dsw-alias-label-primary)' },
  heading: { margin: 0, fontSize: 20, lineHeight: '28px' },
  subheading: { margin: 0, fontSize: 14, lineHeight: '22px' },
  description: { margin: '4px 0 0', color: 'var(--dsw-alias-label-secondary)', lineHeight: '22px' },
  helper: { margin: 0, color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' },
  muted: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 },
  card: { display: 'grid', gap: 14, padding: 16, border: '0.5px solid var(--dsw-alias-settings-card-stroke)', borderRadius: 'var(--dsw-radius-xl)', background: 'var(--dsw-alias-settings-card-fill)' },
  form: { display: 'grid', gap: 12 },
  field: { display: 'grid', gap: 5 },
  label: { fontWeight: 600, fontSize: 13, lineHeight: '18px' },
  input: { boxSizing: 'border-box' as const, width: '100%', height: 36, padding: '0 10px', border: '0.5px solid var(--dsw-alias-border-l3)', borderRadius: 'var(--dsw-radius-md)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit' },
  numberInput: { boxSizing: 'border-box' as const, width: 96, height: 36, padding: '0 10px', border: '0.5px solid var(--dsw-alias-border-l3)', borderRadius: 'var(--dsw-radius-md)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit' },
  inputWithAction: { display: 'flex', alignItems: 'center', gap: 8 },
  inlineButton: { height: 28, padding: '0 6px', border: 0, borderRadius: 'var(--dsw-radius-sm)', background: 'transparent', color: 'var(--dsw-alias-state-business-primary)', cursor: 'pointer', font: 'inherit', fontSize: 12 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
  primaryButton: { height: 36, padding: '0 14px', border: 0, borderRadius: 'var(--dsw-radius-md)', background: 'var(--dsw-alias-button-primary-fill)', color: 'var(--dsw-alias-label-primary-foreground)', cursor: 'pointer', font: 'inherit' },
  secondaryButton: { height: 36, padding: '0 14px', border: '0.5px solid var(--dsw-alias-border-l3)', borderRadius: 'var(--dsw-radius-md)', background: 'transparent', color: 'var(--dsw-alias-label-primary)', cursor: 'pointer', font: 'inherit' },
  ghostButton: { height: 36, padding: '0 14px', border: 0, borderRadius: 'var(--dsw-radius-md)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', font: 'inherit' },
  selectedButton: { height: 36, padding: '0 14px', border: '0.5px solid var(--dsw-alias-state-business-primary)', borderRadius: 'var(--dsw-radius-md)', background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-state-business-primary)', cursor: 'default', font: 'inherit' },
  statusBar: { display: 'flex', alignItems: 'center', gap: 12, minHeight: 24 },
  statusIndicator: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600 },
  statusDot: { width: 8, height: 8, borderRadius: '50%' },
  error: { margin: 0, padding: '10px 12px', borderRadius: 'var(--dsw-radius-md)', color: 'var(--dsw-alias-state-error-primary)', background: 'var(--dsw-alias-bg-module-platform)' },
  routes: { display: 'grid', gap: 10 },
  sectionHeading: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  route: { display: 'grid', gap: 12, padding: 14, border: '0.5px solid var(--dsw-alias-settings-card-stroke)', borderRadius: 'var(--dsw-radius-xl)', background: 'var(--dsw-alias-settings-card-fill)' },
  routeSelected: { borderColor: 'var(--dsw-alias-state-business-primary)', boxShadow: '0 0 0 1px var(--dsw-alias-state-business-primary)' },
  routeMain: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  routeTitle: { display: 'grid', gap: 2, minWidth: 0 },
  routeId: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 },
  statusTag: { flexShrink: 0, fontSize: 12, fontWeight: 600 },
  details: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 16px', margin: 0 },
  detailLabel: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, lineHeight: '18px' },
  detailValue: { margin: 0, color: 'var(--dsw-alias-label-primary)', lineHeight: '20px' },
  toggle: { display: 'inline-flex', gap: 7, alignItems: 'center', whiteSpace: 'nowrap' as const, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
  refreshHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  intervalRow: { display: 'grid', gap: 5 },
  intervalControls: { display: 'flex', alignItems: 'center', gap: 8 },
  selectedCard: { display: 'grid', gap: 12, padding: 16, border: '0.5px solid var(--dsw-alias-border-l3)', borderRadius: 'var(--dsw-radius-xl)', background: 'var(--dsw-alias-bg-layer-1)' },
  emptyState: { display: 'grid', justifyItems: 'start', gap: 8, padding: 20, border: '0.5px dashed var(--dsw-alias-border-l3)', borderRadius: 'var(--dsw-radius-xl)', background: 'var(--dsw-alias-bg-layer-1)' },
  breakWord: { overflowWrap: 'anywhere' as const },
} as const

function registerUi(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'higress-ai-route: dictionaries')
  const raw = (ctx.remote as unknown as { higressGateway: RawGatewayRemote }).higressGateway
  const remote: GatewayRemote = {
    status: () => unwrap(() => raw.status()),
    login: request => unwrap(() => raw.login(request)),
    logout: () => unwrap(() => raw.logout()),
    refresh: request => unwrap(() => raw.refresh(request)),
    selectRoute: request => unwrap(() => raw.selectRoute(request)),
    setRouteCredential: request => unwrap(() => raw.setRouteCredential(request)),
    setAutoRefresh: (enabled, intervalSeconds) => unwrap(() => raw.setAutoRefresh(enabled, intervalSeconds)),
  }
  const t = ctx.locale.bind(NS) as (key: keyof Copy) => string
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: SETTINGS_NAMESPACE,
    order: 30,
    label: () => t('name'),
    locale: NS,
    inject: () => ({ remote, t }),
  }, GatewayPanel))
}

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(remoteContribution)
  const ui = ctx.inject(['slots', 'locale', 'remote.higressGateway'], child => {
    registerUi(child)
  })
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await unmountRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await unmountRemote()
  }
}

export const name = `${PLUGIN_NAME}/client`
