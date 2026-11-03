import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultModel, providerId, providerProfile, routeCredentialRef, selectedRoute } from '../dist/shared/route-mapper.js'

const noAuth = {
  schemaVersion: '1',
  gateway: { instanceId: 'gw-1' },
  route: { routeId: 'route-a', name: 'Route A', status: 'READY', configVersion: 'v1' },
  endpoint: { protocol: 'OPENAI_CHAT_COMPLETIONS', baseUrl: 'https://gateway.example/v1' },
  models: [],
  authentication: { required: false, credentials: [] },
  routing: { sessionAffinityEnabled: true, effectivePriority: 'SESSION_AFFINITY_FIRST' },
  eligibility: { connectable: true },
}

test('uses fixed defaults for a route without model or auth', () => {
  assert.equal(defaultModel(noAuth), 'higress-default-model')
  const selected = selectedRoute(noAuth)
  assert.equal(selected.credentialRef, 'HIGRESS_AI_ROUTE_NO_AUTH')
  assert.equal(selected.provider, 'higress-route-a-3a560b02')
  assert.deepEqual(providerProfile(noAuth), {
    displayName: 'Route A',
    api: 'openai-completions',
    baseURL: 'https://gateway.example/v1',
    models: [{ id: 'higress-default-model', name: 'higress-default-model' }],
    apiKeyEnv: 'HIGRESS_AI_ROUTE_NO_AUTH',
  })
})

test('only maps bearer credentials and keeps ids deterministic', () => {
  const config = structuredClone(noAuth)
  config.authentication = {
    required: true,
    credentials: [{ credentialId: 'c1', transport: { type: 'BEARER' } }],
  }
  config.models = [{ id: 'deepseek-chat', default: true }]
  const selected = selectedRoute(config, routeCredentialRef(config.route.routeId, config.gateway.instanceId, 'c1'))
  assert.equal(selected.authTransport, 'BEARER')
  assert.equal(selected.credentialRef, 'HIGRESS_AI_ROUTE_ROUTE_A_4A0089EA_KEY')
  assert.equal(providerId('route/a', 'gw-1'), 'higress-route-a-465a9b14')
})
