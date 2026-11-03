/** Public, secret-free contract between the gateway connector and its UI. */

export const PLUGIN_NAME = 'dsh-higress-ai-route-plugin'
export const SETTINGS_NAMESPACE = 'higress-ai-route'
export const COOKIE_CREDENTIAL_REF = 'HIGRESS_AI_ROUTE_CONSOLE_COOKIE'
export const NO_AUTH_CREDENTIAL_REF = 'HIGRESS_AI_ROUTE_NO_AUTH'
export const NO_AUTH_CREDENTIAL_VALUE = 'higress-no-auth'
export const DEFAULT_REFRESH_INTERVAL_SECONDS = 60
export const DEFAULT_MODEL_ID = 'higress-default-model'

export type ConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTED'
  | 'CREDENTIAL_REQUIRED'
  | 'READY'
  | 'SYNC_DEGRADED'
  | 'REAUTH_REQUIRED'
  | 'ROUTE_UNAVAILABLE'

export type CredentialTransport = 'NONE' | 'BEARER' | 'HEADER' | 'QUERY' | string

export interface RouteSummary {
  routeId: string
  name: string
  status: string
  protocol: string
  models: string[]
  authRequired: boolean
  configVersion?: string
  updatedAt?: number
  reasonCode?: string
  reasonMessage?: string
}

export interface CallableRouteConfig {
  schemaVersion: string
  gateway: { instanceId?: string; displayName?: string }
  route: {
    routeId: string
    name: string
    status: string
    configVersion: string
    updatedAt?: number
  }
  endpoint: { protocol: string; baseUrl: string }
  models: Array<{ id: string; displayName?: string; default: boolean; source?: string }>
  authentication: {
    required: boolean
    credentials: Array<{
      credentialId: string
      name?: string
      keyPrefix?: string
      status?: string
      transport: { type: CredentialTransport; name?: string }
    }>
  }
  routing: { sessionAffinityEnabled: boolean; effectivePriority: string }
  eligibility: { connectable: boolean; reasonCode?: string; reasonMessage?: string }
}

export interface SelectedRouteView {
  routeId: string
  name: string
  configVersion: string
  provider: string
  model: string
  baseUrl: string
  protocol: string
  authTransport: CredentialTransport
  credentialRef?: string
  connectable: boolean
  reasonCode?: string
  reasonMessage?: string
}

export interface ConnectorSnapshot {
  status: ConnectionStatus
  gatewayUrl?: string
  username?: string
  routes: RouteSummary[]
  selected?: SelectedRouteView
  autoRefresh: boolean
  refreshIntervalSeconds: number
  lastRefreshAt?: number
  lastError?: string
}

export interface LoginRequest {
  gatewayUrl: string
  username: string
  password: string
}

export interface SetCredentialRequest {
  routeId: string
  value: string
}

export interface SelectRouteRequest {
  routeId: string
}

export interface RefreshRequest {
  force?: boolean
}

export function isBearer(transport: CredentialTransport): boolean {
  return transport.toUpperCase() === 'BEARER'
}

export function isNoAuth(config: CallableRouteConfig): boolean {
  return config.authentication.required === false
}
