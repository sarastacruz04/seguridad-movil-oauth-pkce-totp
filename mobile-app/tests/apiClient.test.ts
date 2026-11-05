/**
 * Prueba de la cola de silent refresh contra el backend REAL (en memoria, mismo proceso).
 * Las dependencias de Expo (SecureStore, memoria, eventos) se sustituyen por dobles simples.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { login, startTestServer, type TestServer } from '../../backend-auth/tests/helpers';
import { createApiClients, type ApiClients } from '../src/api/createApiClients';
import { ElevationExpiredError, MfaRequiredError, NetworkError, SessionExpiredError } from '../src/api/errors';
import type { SessionExpiredReason } from '../src/auth/sessionEvents';

let server: TestServer;

interface Harness {
  readonly clients: ApiClients;
  readonly refreshCalls: () => number;
  readonly expirations: SessionExpiredReason[];
  readonly logs: string[];
  readonly memory: { access: string | null };
  readonly secure: { refresh: string | null };
}

function createHarness(baseURL: string, access: string | null, refresh: string | null): Harness {
  const memory = { access };
  const secure = { refresh };
  const expirations: SessionExpiredReason[] = [];
  const logs: string[] = [];
  const clients = createApiClients({
    baseURL,
    timeoutMs: 2000,
    tokens: {
      getAccessToken: () => memory.access,
      setAccessToken: (token) => {
        memory.access = token;
      },
      clearAll: () => {
        memory.access = null;
      },
      clearElevatedToken: () => undefined,
    },
    refreshTokens: {
      get: async () => secure.refresh,
      clear: async () => {
        secure.refresh = null;
      },
    },
    onSessionExpired: (reason) => expirations.push(reason),
    log: (_level, message) => logs.push(message),
  });
  let calls = 0;
  clients.authHttp.interceptors.request.use((config) => {
    if (config.url === '/auth/refresh') calls += 1;
    return config;
  });
  return { clients, refreshCalls: () => calls, expirations, logs, memory, secure };
}

before(async () => {
  server = await startTestServer();
});
after(async () => server.close());

describe('Cola de silent refresh (axios + backend real)', () => {
  let tokens: { access_token: string; refresh_token: string };
  beforeEach(async () => {
    tokens = await login(server.baseUrl);
  });

  it('con token válido no hay refresh', async () => {
    const h = createHarness(server.baseUrl, tokens.access_token, tokens.refresh_token);
    const res = await h.clients.apiHttp.get('/api/me');
    assert.equal(res.status, 200);
    assert.equal(h.refreshCalls(), 0);
  });

  it('5 peticiones concurrentes con token inválido → UN solo POST /auth/refresh y 5 respuestas 200', async () => {
    const h = createHarness(server.baseUrl, 'token-invalidado-en-memoria', tokens.refresh_token);
    const results = await Promise.all(Array.from({ length: 5 }, () => h.clients.apiHttp.get('/api/me')));
    assert.deepEqual(
      results.map((r) => r.status),
      [200, 200, 200, 200, 200],
    );
    assert.equal(h.refreshCalls(), 1);
    assert.notEqual(h.memory.access, 'token-invalidado-en-memoria');
    assert.equal(h.logs.filter((m) => m.startsWith('Reintento OK')).length, 5);
  });

  it('token expirado (TTL) → se renueva en silencio y la petición original se reintenta', async () => {
    const h = createHarness(server.baseUrl, tokens.access_token, tokens.refresh_token);
    server.advance(301);
    const res = await h.clients.apiHttp.get('/api/me');
    assert.equal(res.status, 200);
    assert.equal(h.refreshCalls(), 1);
  });

  it('peticiones lanzadas DURANTE el refresh se pausan y salen con el token nuevo', async () => {
    const h = createHarness(server.baseUrl, 'token-invalidado-en-memoria', tokens.refresh_token);
    const first = h.clients.apiHttp.get('/api/me');
    await new Promise((resolve) => setTimeout(resolve, 15)); // deja que llegue el 401 y empiece el refresh
    const late = await Promise.all([h.clients.apiHttp.get('/api/me'), h.clients.apiHttp.get('/api/me')]);
    assert.equal((await first).status, 200);
    assert.deepEqual(
      late.map((r) => r.status),
      [200, 200],
    );
    assert.equal(h.refreshCalls(), 1);
  });

  it('refresh revocado → todas rechazan con SessionExpiredError, se limpia SecureStore y se avisa UNA vez', async () => {
    await fetch(`${server.baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });
    const h = createHarness(server.baseUrl, 'token-invalidado-en-memoria', tokens.refresh_token);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => h.clients.apiHttp.get('/api/me')));
    for (const result of results) {
      assert.equal(result.status, 'rejected');
      assert.ok((result as PromiseRejectedResult).reason instanceof SessionExpiredError);
    }
    assert.equal(h.refreshCalls(), 1);
    assert.equal(h.secure.refresh, null);
    assert.equal(h.memory.access, null);
    assert.deepEqual(h.expirations, ['refresh_rejected']);
  });

  it('sin red → NetworkError y el refresh_token se CONSERVA', async () => {
    const h = createHarness('http://127.0.0.1:9', 'cualquiera', tokens.refresh_token);
    await assert.rejects(h.clients.apiHttp.get('/api/me'), NetworkError);
    await assert.rejects(h.clients.refreshAccessToken(), NetworkError);
    assert.equal(h.secure.refresh, tokens.refresh_token);
    assert.deepEqual(h.expirations, []);
  });

  it('403 mfa_required NO dispara refresh: MfaRequiredError con step_up_token', async () => {
    const h = createHarness(server.baseUrl, tokens.access_token, tokens.refresh_token);
    await assert.rejects(h.clients.apiHttp.get('/api/boveda-critica'), (error: unknown) => {
      assert.ok(error instanceof MfaRequiredError);
      assert.match(error.stepUpToken, /^[\w-]+\.[\w-]+\.[\w-]+$/);
      return true;
    });
    assert.equal(h.refreshCalls(), 0);
  });

  it('401 con token elevado → ElevationExpiredError (sin refresh)', async () => {
    const h = createHarness(server.baseUrl, tokens.access_token, tokens.refresh_token);
    await assert.rejects(
      h.clients.apiHttp.get('/api/boveda-critica', { authMode: 'elevated', headers: { Authorization: 'Bearer vencido.x.y' } }),
      ElevationExpiredError,
    );
    assert.equal(h.refreshCalls(), 0);
  });
});
