import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { totp } from '../src/lib/totp.js';
import {
  REDIRECT_URI,
  type TestServer,
  authorize,
  createPkcePair,
  getWithToken,
  login,
  postJson,
  readQuery,
  startTestServer,
} from './helpers.js';

interface ErrorBody {
  error: string;
  message: string;
  step_up_token?: string;
}

let server: TestServer;
before(async () => {
  server = await startTestServer();
});
after(async () => server.close());

const currentCode = (offsetSeconds = 0): string => totp(server.ctx.totpKey, server.nowSeconds() + offsetSeconds);

async function stepUpToken(accessToken: string): Promise<string> {
  const res = await getWithToken(server.baseUrl, '/api/boveda-critica', accessToken);
  assert.equal(res.status, 403);
  const body = (await res.json()) as ErrorBody;
  assert.equal(body.error, 'mfa_required');
  assert.ok(body.step_up_token);
  return body.step_up_token;
}

describe('GET /oauth/authorize', () => {
  const base = {
    response_type: 'code',
    client_id: 'unisabana-mobile',
    redirect_uri: REDIRECT_URI,
    state: 'estado-aleatorio-123456',
    code_challenge_method: 'S256',
  };

  it('muestra el formulario con parámetros válidos', async () => {
    const qs = new URLSearchParams({ ...base, code_challenge: createPkcePair().challenge });
    const res = await fetch(`${server.baseUrl}/oauth/authorize?${qs}`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<form method="post"/);
  });

  it('rechaza code_challenge_method=plain devolviendo el error a la app', async () => {
    const qs = new URLSearchParams({ ...base, code_challenge: createPkcePair().challenge, code_challenge_method: 'plain' });
    const res = await fetch(`${server.baseUrl}/oauth/authorize?${qs}`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(readQuery(res.headers.get('location') ?? '').error, 'invalid_request');
  });

  it('no redirige a un redirect_uri fuera de la allowlist (evita open redirect)', async () => {
    const qs = new URLSearchParams({ ...base, code_challenge: createPkcePair().challenge, redirect_uri: 'https://evil.example/cb' });
    const res = await fetch(`${server.baseUrl}/oauth/authorize?${qs}`, { redirect: 'manual' });
    assert.equal(res.status, 400);
    assert.equal(res.headers.get('location'), null);
  });

  it('acepta redirect_uri de Expo Go (exp://) y conserva su query', async () => {
    const { challenge } = createPkcePair();
    const form = new URLSearchParams({
      ...base,
      redirect_uri: 'exp://192.168.1.5:8081/--/callback?x=1',
      code_challenge: challenge,
      email: 'estudiante@unisabana.edu.co',
      password: 'clave-de-prueba',
    });
    const res = await fetch(`${server.baseUrl}/oauth/authorize`, { method: 'POST', body: form, redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.match(
      res.headers.get('location') ?? '',
      /^exp:\/\/192\.168\.1\.5:8081\/--\/callback\?x=1&code=[\w-]+&state=estado-aleatorio-123456$/,
    );
  });
});

describe('Canje del code (POST /auth/oauth/token)', () => {
  it('credenciales incorrectas no emiten code', async () => {
    const { status, location } = await authorize(server.baseUrl, createPkcePair().challenge, 'estado-aleatorio-123456', 'mala');
    assert.equal(status, 401);
    assert.equal(location, null);
  });

  it('PKCE con verifier incorrecto es rechazado y el code queda quemado', async () => {
    const { verifier, challenge } = createPkcePair();
    const state = randomBytes(16).toString('base64url');
    const { location } = await authorize(server.baseUrl, challenge, state);
    const query = readQuery(location ?? '');
    assert.equal(query.state, state);

    const exchange = (codeVerifier: string) =>
      postJson(server.baseUrl, '/auth/oauth/token', {
        grant_type: 'authorization_code',
        code: query.code,
        code_verifier: codeVerifier,
        client_id: 'unisabana-mobile',
        redirect_uri: REDIRECT_URI,
      });
    const wrong = await exchange(createPkcePair().verifier);
    assert.equal(wrong.status, 400);
    assert.equal(((await wrong.json()) as ErrorBody).error, 'invalid_grant');
    // Ni siquiera con el verifier correcto: el code se borró al primer intento.
    const retry = await exchange(verifier);
    assert.equal(retry.status, 400);
  });

  it('el code es de un solo uso', async () => {
    const { verifier, challenge } = createPkcePair();
    const { location } = await authorize(server.baseUrl, challenge, randomBytes(16).toString('base64url'));
    const body = {
      grant_type: 'authorization_code',
      code: readQuery(location ?? '').code,
      code_verifier: verifier,
      client_id: 'unisabana-mobile',
      redirect_uri: REDIRECT_URI,
    };
    const first = await postJson(server.baseUrl, '/auth/oauth/token', body);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    const second = await postJson(server.baseUrl, '/auth/oauth/token', body);
    assert.equal(second.status, 400);
  });

  it('redirect_uri distinto al del authorize es rechazado', async () => {
    const { verifier, challenge } = createPkcePair();
    const { location } = await authorize(server.baseUrl, challenge, randomBytes(16).toString('base64url'));
    const res = await postJson(server.baseUrl, '/auth/oauth/token', {
      grant_type: 'authorization_code',
      code: readQuery(location ?? '').code,
      code_verifier: verifier,
      client_id: 'unisabana-mobile',
      redirect_uri: 'unisabana-auth://otra',
    });
    assert.equal(res.status, 400);
  });

  it('code expirado (más de 60 s) es rechazado', async () => {
    const { verifier, challenge } = createPkcePair();
    const { location } = await authorize(server.baseUrl, challenge, randomBytes(16).toString('base64url'));
    server.advance(61);
    const res = await postJson(server.baseUrl, '/auth/oauth/token', {
      grant_type: 'authorization_code',
      code: readQuery(location ?? '').code,
      code_verifier: verifier,
      client_id: 'unisabana-mobile',
      redirect_uri: REDIRECT_URI,
    });
    assert.equal(res.status, 400);
  });
});

describe('Recursos protegidos y refresh', () => {
  it('/api/me: 200 con access, 401 sin token o con token expirado', async () => {
    const { access_token } = await login(server.baseUrl);
    assert.equal((await getWithToken(server.baseUrl, '/api/me', access_token)).status, 200);
    assert.equal((await fetch(`${server.baseUrl}/api/me`)).status, 401);
    server.advance(301);
    const expired = await getWithToken(server.baseUrl, '/api/me', access_token);
    assert.equal(expired.status, 401);
    assert.equal(((await expired.json()) as ErrorBody).error, 'token_expired');
  });

  it('refresh válido emite nuevo access; refresh revocado o inválido → 401 invalid_grant', async () => {
    const { refresh_token } = await login(server.baseUrl);
    const ok = await postJson(server.baseUrl, '/auth/refresh', { refresh_token });
    assert.equal(ok.status, 200);
    const { access_token } = (await ok.json()) as { access_token: string };
    assert.equal((await getWithToken(server.baseUrl, '/api/me', access_token)).status, 200);

    await postJson(server.baseUrl, '/auth/logout', { refresh_token });
    const revoked = await postJson(server.baseUrl, '/auth/refresh', { refresh_token });
    assert.equal(revoked.status, 401);
    assert.equal(((await revoked.json()) as ErrorBody).error, 'invalid_grant');
    assert.equal((await postJson(server.baseUrl, '/auth/refresh', { refresh_token: 'inventado' })).status, 401);
  });
});

describe('Step-up + anti-replay', () => {
  it('bóveda: 403 con access → verify 200 → bóveda 200 → mismo código 409', async () => {
    const { access_token } = await login(server.baseUrl);
    const stepUp = await stepUpToken(access_token);

    // El step_up_token por sí solo NUNCA da acceso.
    assert.equal((await getWithToken(server.baseUrl, '/api/boveda-critica', stepUp)).status, 401);

    const code = currentCode();
    const verified = await postJson(server.baseUrl, '/auth/mfa/verify', { step_up_token: stepUp, code });
    assert.equal(verified.status, 200);
    const { elevated_token, expires_in } = (await verified.json()) as { elevated_token: string; expires_in: number };
    assert.equal(expires_in, 600);

    const vault = await getWithToken(server.baseUrl, '/api/boveda-critica', elevated_token);
    assert.equal(vault.status, 200);
    assert.equal((await getWithToken(server.baseUrl, '/api/boveda', elevated_token)).status, 200);

    const replay = await postJson(server.baseUrl, '/auth/mfa/verify', { step_up_token: stepUp, code });
    assert.equal(replay.status, 409);
    assert.deepEqual(await replay.json(), { error: 'replay_detected', message: 'Replay Attack Detected' });

    // El token elevado vence a los 10 minutos.
    server.advance(601);
    assert.equal((await getWithToken(server.baseUrl, '/api/boveda-critica', elevated_token)).status, 401);
  });

  it('acepta C-1 y C+1, rechaza C+2; formato inválido → 400 invalid_format', async () => {
    const { access_token } = await login(server.baseUrl);
    const stepUp = await stepUpToken(access_token);
    const verify = (code: string) => postJson(server.baseUrl, '/auth/mfa/verify', { step_up_token: stepUp, code });

    assert.equal((await verify(currentCode(-30))).status, 200);
    assert.equal((await verify(currentCode(30))).status, 200);
    const far = await verify(currentCode(60));
    assert.equal(far.status, 400);
    assert.equal(((await far.json()) as ErrorBody).error, 'invalid_code');
    const bad = await verify('12ab56');
    assert.equal(((await bad.json()) as ErrorBody).error, 'invalid_format');
  });

  it('el caché anti-replay expira a los 90 s', async () => {
    server.advance(120);
    const { access_token } = await login(server.baseUrl);
    const stepUp = await stepUpToken(access_token);
    const code = currentCode();
    assert.equal((await postJson(server.baseUrl, '/auth/mfa/verify', { step_up_token: stepUp, code })).status, 200);
    server.advance(91);
    // Pasados 90 s el código ya no está en el caché, pero también salió de las ventanas válidas → 400, no 409.
    const later = await postJson(server.baseUrl, '/auth/mfa/verify', { step_up_token: stepUp, code });
    assert.equal(later.status, 400);
    assert.equal(server.ctx.replayCache.has(`usr_estudiante_001:${code}`, server.nowSeconds() * 1000), false);
  });

  it('5 fallos en un minuto → 429', async () => {
    server.advance(120);
    const { access_token } = await login(server.baseUrl);
    const stepUp = await stepUpToken(access_token);
    const wrong = currentCode() === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await postJson(server.baseUrl, '/auth/mfa/verify', { step_up_token: stepUp, code: wrong })).status, 400);
    }
    assert.equal((await postJson(server.baseUrl, '/auth/mfa/verify', { step_up_token: stepUp, code: currentCode() })).status, 429);
    server.advance(61);
  });

  it('step_up_token inválido → 401 invalid_step_up_token', async () => {
    const res = await postJson(server.baseUrl, '/auth/mfa/verify', { step_up_token: 'x.y.z', code: '123456' });
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as ErrorBody).error, 'invalid_step_up_token');
  });
});
