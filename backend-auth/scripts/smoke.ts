/**
 * Smoke test del flujo completo contra el servidor local (npm run dev en otra terminal):
 * PKCE → authorize → token → bóveda 403 → TOTP → verify 200 → bóveda 200 → replay 409 → refresh OK → refresh inválido 401.
 * Sale con código ≠ 0 si algún paso falla.
 */
import { createHash, randomBytes } from 'node:crypto';

import { buildConfig, loadDotEnv } from '../src/config.js';
import { decodeBase32 } from '../src/lib/base32.js';
import { TOTP_PERIOD_SECONDS, totp } from '../src/lib/totp.js';

loadDotEnv();
const config = buildConfig(process.env);
const BASE_URL = process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${config.port}`;
const REDIRECT_URI = 'unisabana-auth://callback';
const totpKey = decodeBase32(config.totpSecret);

class SmokeFailure extends Error {
  override readonly name = 'SmokeFailure';
}

let stepNumber = 0;
function ok(message: string): void {
  stepNumber += 1;
  console.log(`  ✔ ${String(stepNumber).padStart(2, '0')}. ${message}`);
}

function expectStatus(res: Response, expected: number, label: string): void {
  if (res.status !== expected) throw new SmokeFailure(`${label}: se esperaba HTTP ${expected} y llegó ${res.status}`);
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function get(path: string, token: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const nowSeconds = () => Math.floor(Date.now() / 1000);

async function main(): Promise<void> {
  console.log(`Smoke test contra ${BASE_URL}\n`);
  expectStatus(await fetch(`${BASE_URL}/health`), 200, 'health');
  ok('GET /health');

  // 1. PKCE en el "cliente"
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url');
  const state = randomBytes(16).toString('base64url');
  ok(`PKCE generado (verifier ${verifier.length} chars, challenge ${challenge.length} chars)`);

  // 2. Login en el "navegador" sin seguir el redirect
  const form = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    email: config.demoUser.email,
    password: config.demoUser.password,
  });
  const authorize = await fetch(`${BASE_URL}/oauth/authorize`, { method: 'POST', body: form, redirect: 'manual' });
  expectStatus(authorize, 302, 'POST /oauth/authorize');
  const location = authorize.headers.get('location') ?? '';
  const query = Object.fromEntries(new URLSearchParams(location.slice(location.indexOf('?') + 1)));
  if (!query.code) throw new SmokeFailure('el redirect no trae code');
  if (query.state !== state) throw new SmokeFailure('el state devuelto no coincide (CSRF)');
  ok('POST /oauth/authorize → 302 con code y el mismo state');

  // 3. Canje con code_verifier
  const tokenRes = await post('/auth/oauth/token', {
    grant_type: 'authorization_code',
    code: query.code,
    code_verifier: verifier,
    client_id: config.clientId,
    redirect_uri: REDIRECT_URI,
  });
  expectStatus(tokenRes, 200, 'POST /auth/oauth/token');
  const tokens = await json<{ access_token: string; refresh_token: string }>(tokenRes);
  ok('POST /auth/oauth/token → access_token + refresh_token');

  // 4. Bóveda con access normal → 403
  const denied = await get('/api/boveda-critica', tokens.access_token);
  expectStatus(denied, 403, 'GET /api/boveda-critica (sin MFA)');
  const { error, step_up_token: stepUp } = await json<{ error: string; step_up_token: string }>(denied);
  if (error !== 'mfa_required' || !stepUp) throw new SmokeFailure('403 sin mfa_required/step_up_token');
  ok('GET /api/boveda-critica → 403 mfa_required + step_up_token');

  // 5. TOTP local + verify
  let code = totp(totpKey, nowSeconds());
  let verify = await post('/auth/mfa/verify', { step_up_token: stepUp, code });
  if (verify.status === 409) {
    // Una ejecución anterior (< 90 s) ya gastó este código: se espera a la siguiente ventana de 30 s.
    const wait = TOTP_PERIOD_SECONDS - (nowSeconds() % TOTP_PERIOD_SECONDS) + 1;
    console.log(`  … el código ya fue usado por una ejecución previa; esperando ${wait}s a la siguiente ventana`);
    await sleep(wait * 1000);
    code = totp(totpKey, nowSeconds());
    verify = await post('/auth/mfa/verify', { step_up_token: stepUp, code });
  }
  expectStatus(verify, 200, 'POST /auth/mfa/verify');
  const { elevated_token: elevated } = await json<{ elevated_token: string }>(verify);
  ok(`POST /auth/mfa/verify con TOTP ${code} → 200 elevated_token`);

  // 6. Bóveda con token elevado → 200
  expectStatus(await get('/api/boveda-critica', elevated), 200, 'GET /api/boveda-critica (elevado)');
  ok('GET /api/boveda-critica con elevated_token → 200');

  // 7. Replay del mismo código → 409
  const replay = await post('/auth/mfa/verify', { step_up_token: stepUp, code });
  expectStatus(replay, 409, 'replay');
  ok(`mismo código ${code} otra vez → 409 ${(await json<{ message: string }>(replay)).message}`);

  // 8. Refresh válido e inválido
  const refreshed = await post('/auth/refresh', { refresh_token: tokens.refresh_token });
  expectStatus(refreshed, 200, 'POST /auth/refresh');
  const { access_token: newAccess } = await json<{ access_token: string }>(refreshed);
  expectStatus(await get('/api/me', newAccess), 200, 'GET /api/me con access renovado');
  ok('POST /auth/refresh → nuevo access_token válido');

  expectStatus(await post('/auth/refresh', { refresh_token: 'refresh-inventado' }), 401, 'refresh inválido');
  ok('refresh_token inválido → 401 invalid_grant');

  console.log('\nSMOKE OK ✅');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nSMOKE FALLÓ ❌  ${message}`);
  if (message.includes('fetch failed')) console.error('¿Está corriendo el backend? (cd backend-auth && npm run dev)');
  process.exit(1);
});
