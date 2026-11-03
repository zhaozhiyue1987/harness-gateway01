import {
  DEFAULT_MODEL_ID,
  NO_AUTH_CREDENTIAL_REF,
  isBearer,
  isNoAuth,
  type CallableRouteConfig,
  type SelectedRouteView,
} from './contracts.ts'

function shortHash(value: string): string {
  // FNV-1a keeps the generated id deterministic in both Host and Browser
  // bundles without introducing a Node-only crypto dependency.
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Build the stable provider route id owned by this plugin. */
export function providerId(routeId: string, gatewayInstanceId = ''): string {
  const safe = routeId.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  if (safe.length === 0) throw new Error('route id cannot produce an empty provider id')
  return `higress-${safe}-${shortHash(`${gatewayInstanceId.trim()}\0${routeId.trim()}`)}`
}

/** Stable Harness credential reference for a user-supplied BEARER key. */
export function routeCredentialRef(routeId: string, gatewayInstanceId = '', credentialId = ''): string {
  const safe = routeId.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase()
  if (safe.length === 0) throw new Error('route id cannot produce a credential reference')
  const identity = `${gatewayInstanceId.trim()}\0${routeId.trim()}\0${credentialId.trim()}`
  return `HIGRESS_AI_ROUTE_${safe}_${shortHash(identity).toUpperCase()}_KEY`
}

/** The model required by Harness when the gateway does not expose a concrete id. */
export function defaultModel(config: CallableRouteConfig): string {
  const model = config.models.find(item => item.default)?.id
    ?? config.models.find(item => item.id.trim().length > 0)?.id
  return model?.trim() || DEFAULT_MODEL_ID
}

/** Pick the only transport the first release can express with official pi-ai. */
export function authTransport(config: CallableRouteConfig): string {
  if (isNoAuth(config)) return 'NONE'
  return authCredential(config)?.transport.type ?? 'UNKNOWN'
}

/** Select the active binding; prefer BEARER when more than one is returned. */
export function authCredential(config: CallableRouteConfig): CallableRouteConfig['authentication']['credentials'][number] | undefined {
  const credentials = config.authentication.credentials
  const active = credentials.filter(item => item.status === undefined || item.status?.toUpperCase() === 'ACTIVE')
  const candidates = (active.length > 0 ? active : credentials)
  return candidates.find(item => typeof item.transport?.type === 'string' && isBearer(item.transport.type)) ?? candidates[0]
}

/** Normalize the gateway base URL and append the route prefix supplied by the server. */
export function providerBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

/** Translate the gateway protocol enum to the official pi-ai API identifier. */
export function providerApi(protocol: string): string {
  if (protocol.trim().toUpperCase() === 'OPENAI_CHAT_COMPLETIONS') return 'openai-completions'
  return protocol.trim()
}

export function selectedRoute(config: CallableRouteConfig, credentialRef?: string): SelectedRouteView {
  const transport = authTransport(config)
  const connectable = config.eligibility.connectable
    && (transport === 'NONE' || isBearer(transport))
  const model = defaultModel(config)
  const ref = transport === 'NONE' ? NO_AUTH_CREDENTIAL_REF : credentialRef
  return {
    routeId: config.route.routeId,
    name: config.route.name,
    configVersion: config.route.configVersion,
    provider: providerId(config.route.routeId, config.gateway.instanceId),
    model,
    baseUrl: providerBaseUrl(config.endpoint.baseUrl),
    protocol: config.endpoint.protocol,
    authTransport: transport,
    ...(ref === undefined ? {} : { credentialRef: ref }),
    connectable,
    ...(config.eligibility.reasonCode === undefined ? {} : { reasonCode: config.eligibility.reasonCode }),
    ...(config.eligibility.reasonMessage === undefined ? {} : { reasonMessage: config.eligibility.reasonMessage }),
  }
}

/** Official dsh-llm-pi-ai profile written for one selected callable route. */
export function providerProfile(config: CallableRouteConfig, credentialRef?: string): Record<string, unknown> {
  const selected = selectedRoute(config, credentialRef)
  if (!selected.connectable) {
    throw new Error(selected.reasonMessage ?? `route ${selected.routeId} is not connectable`)
  }
  const profile: Record<string, unknown> = {
    displayName: selected.name,
    api: providerApi(selected.protocol),
    baseURL: selected.baseUrl,
    models: [{ id: selected.model, name: selected.model }],
  }
  if (selected.credentialRef !== undefined) profile.apiKeyEnv = selected.credentialRef
  return profile
}
