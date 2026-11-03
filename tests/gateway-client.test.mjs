import test from 'node:test'
import assert from 'node:assert/strict'
import { GatewayClient, normalizeConsoleUrl } from '../dist/host/gateway-client.js'

test('preserves a reverse-proxy path prefix and rejects URL credentials', () => {
  assert.equal(normalizeConsoleUrl('https://gateway.example/console/'), 'https://gateway.example/console')
  assert.throws(() => normalizeConsoleUrl('https://user:pass@gateway.example'), /credentials/)
  assert.throws(() => normalizeConsoleUrl('file:///tmp/gateway'), /http or https/)
})

test('logs in with a cookie and sends it to route APIs', async () => {
  const calls = []
  const client = new GatewayClient('https://gateway.example/console', {
    timeoutMs: 2000,
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init })
      if (String(url).endsWith('/session/login')) {
        return new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'set-cookie': 'HIGRESSSESSION=abc; Path=/' },
        })
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  await client.login({ gatewayUrl: 'https://gateway.example/console', username: 'u', password: 'p' })
  await client.listRoutes()
  assert.equal(calls[0].url, 'https://gateway.example/console/session/login')
  assert.equal(calls[1].url, 'https://gateway.example/console/v1/ai/callable-routes')
  assert.equal(calls[1].init.headers.cookie, 'HIGRESSSESSION=abc')
})

test('keeps ETag semantics and maps authentication failures without exposing response data', async () => {
  const calls = []
  const client = new GatewayClient('https://gateway.example', {
    timeoutMs: 2000,
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init })
      if (String(url).endsWith('/v1/ai/callable-routes/route-a')) {
        return new Response(null, { status: 304, headers: { etag: 'v2' } })
      }
      return new Response(JSON.stringify({ message: 'secret backend detail' }), { status: 401 })
    },
  })
  const cached = await client.getRoute('route-a', 'v1')
  assert.deepEqual(cached, { value: undefined, etag: 'v2', notModified: true })
  assert.equal(calls[0].init.headers['if-none-match'], 'v1')
  await assert.rejects(() => client.listRoutes(), error => error.code === 'REAUTH_REQUIRED' && !error.message.includes('secret backend detail'))
})
