import type { CallableRouteConfig, LoginRequest, RouteSummary } from '../shared/contracts.ts'

export class GatewayHttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'GatewayHttpError'
    this.status = status
    this.code = code
  }
}

export interface GatewayClientOptions {
  timeoutMs: number
  fetcher?: typeof fetch
}

export interface GatewayResponse<T> {
  value: T
  etag?: string
  notModified: boolean
}

interface RawEnvelope<T> {
  data?: T
  result?: T
  code?: number | string
  message?: string
}

function normalizeGatewayUrl(raw: string): URL {
  const value = raw.trim()
  if (value.length === 0) throw new Error('gateway URL is required')
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('gateway URL must use http or https')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('gateway URL must not contain credentials, query, or fragment')
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
  return url
}

function joinUrl(base: URL, path: string): string {
  const prefix = base.pathname === '/' ? '' : base.pathname
  return `${base.origin}${prefix}/${path.replace(/^\/+/, '')}`
}

function extractValue<T>(payload: RawEnvelope<T> | T): T {
  if (payload !== null && typeof payload === 'object') {
    const candidate = payload as RawEnvelope<T>
    if ('data' in candidate && candidate.data !== undefined) return candidate.data
    if ('result' in candidate && candidate.result !== undefined) return candidate.result
  }
  return payload as T
}

function cookiePair(setCookie: string): string | undefined {
  const pair = setCookie.split(';', 1)[0]?.trim()
  return pair && pair.includes('=') ? pair : undefined
}

function mergeCookies(previous: string | undefined, headers: Headers): string | undefined {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
  if (values.length === 0) return previous
  const map = new Map<string, string>()
  for (const raw of previous?.split('; ') ?? []) {
    const index = raw.indexOf('=')
    if (index > 0) map.set(raw.slice(0, index), raw)
  }
  for (const raw of values) {
    const pair = cookiePair(raw)
    if (pair === undefined) continue
    map.set(pair.slice(0, pair.indexOf('=')), pair)
  }
  return [...map.values()].join('; ')
}

function httpErrorMessage(status: number, phase: 'login' | 'request'): string {
  if (status === 401 || status === 403) return `gateway authentication or permission failed (HTTP ${status})`
  if (status === 404) return `gateway resource was not found (HTTP ${status})`
  return `gateway ${phase} failed (HTTP ${status})`
}

/** Cookie-preserving control-plane client. Passwords never enter this object after login returns. */
export class GatewayClient {
  readonly baseUrl: URL
  private readonly timeoutMs: number
  private readonly fetcher: typeof fetch
  private cookie?: string

  constructor(rawUrl: string, options: GatewayClientOptions) {
    this.baseUrl = normalizeGatewayUrl(rawUrl)
    this.timeoutMs = options.timeoutMs
    this.fetcher = options.fetcher ?? fetch
  }

  get cookieHeader(): string | undefined {
    return this.cookie
  }

  setCookieHeader(cookie: string | undefined): void {
    this.cookie = cookie?.trim() || undefined
  }

  async login(request: LoginRequest): Promise<void> {
    const response = await this.request('/session/login', {
      method: 'POST',
      body: { username: request.username, password: request.password, autoLogin: true },
      includeCookie: false,
    })
    if (!response.ok) throw new GatewayHttpError(response.status, 'LOGIN_FAILED', httpErrorMessage(response.status, 'login'))
    this.cookie = mergeCookies(undefined, response.headers)
    if (this.cookie === undefined) throw new GatewayHttpError(500, 'LOGIN_NO_SESSION', 'gateway login did not return a session cookie')
  }

  async logout(): Promise<void> {
    try {
      await this.request('/session/logout', { method: 'GET', includeCookie: true })
    } finally {
      this.cookie = undefined
    }
  }

  async listRoutes(signal?: AbortSignal): Promise<GatewayResponse<RouteSummary[]>> {
    const response = await this.request('/v1/ai/callable-routes', { method: 'GET', signal, includeCookie: true })
    if (!response.ok) throw this.toHttpError(response)
    return { value: extractValue(response.body) as RouteSummary[], etag: response.headers.get('etag') ?? undefined, notModified: false }
  }

  async getRoute(routeId: string, etag?: string, signal?: AbortSignal): Promise<GatewayResponse<CallableRouteConfig | undefined>> {
    if (routeId.trim().length === 0) throw new Error('route id is required')
    const response = await this.request(`/v1/ai/callable-routes/${encodeURIComponent(routeId)}`, {
      method: 'GET',
      signal,
      includeCookie: true,
      headers: etag === undefined ? {} : { 'if-none-match': etag },
    })
    if (response.status === 304) return { value: undefined, etag: response.headers.get('etag') ?? etag, notModified: true }
    if (!response.ok) throw this.toHttpError(response)
    return {
      value: extractValue(response.body) as CallableRouteConfig,
      etag: response.headers.get('etag') ?? undefined,
      notModified: false,
    }
  }

  private toHttpError(response: { status: number; body: unknown }): GatewayHttpError {
    const status = response.status
    return new GatewayHttpError(status, status === 401 || status === 403 ? 'REAUTH_REQUIRED' : 'GATEWAY_REQUEST_FAILED', httpErrorMessage(status, 'request'))
  }

  private async request(
    path: string,
    options: {
      method: 'GET' | 'POST'
      body?: unknown
      headers?: Record<string, string>
      signal?: AbortSignal
      includeCookie: boolean
    },
  ): Promise<{ ok: boolean; status: number; headers: Headers; body: unknown }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const signal = options.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, options.signal])
    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      }
      if (options.includeCookie && this.cookie !== undefined) headers.cookie = this.cookie
      let response: Response
      try {
        response = await this.fetcher(joinUrl(this.baseUrl, path), {
          method: options.method,
          headers,
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
          signal,
        })
      } catch (error) {
        if (signal.aborted) throw new GatewayHttpError(408, 'GATEWAY_TIMEOUT', 'gateway request timed out or was cancelled')
        throw new GatewayHttpError(503, 'GATEWAY_UNREACHABLE', 'gateway could not be reached')
      }
      const text = await response.text()
      let body: unknown = undefined
      if (text.trim().length > 0) {
        try { body = JSON.parse(text) } catch { body = text }
      }
      if (options.includeCookie) this.cookie = mergeCookies(this.cookie, response.headers)
      return { ok: response.ok, status: response.status, headers: response.headers, body }
    } finally {
      clearTimeout(timer)
    }
  }
}

export function normalizeConsoleUrl(value: string): string {
  return normalizeGatewayUrl(value).toString().replace(/\/$/, '')
}
