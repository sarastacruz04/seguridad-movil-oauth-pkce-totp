import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { createApp } from '../src/app.js';
import { buildConfig } from '../src/config.js';
import { type AppContext, createContext } from '../src/context.js';

export const TEST_PASSWORD = 'clave-de-prueba';
export const REDIRECT_URI = 'unisabana-auth://callback';

export interface TestServer {
  readonly baseUrl: string;
  readonly ctx: AppContext;
  /** Avanza el reloj inyectado (segundos). */
  advance(seconds: number): void;
  nowSeconds(): number;
  close(): Promise<void>;
}

export async function startTestServer(env: NodeJS.ProcessEnv = {}): Promise<TestServer> {
  // Reloj fijo a mitad de una ventana TOTP (múltiplo de 30 + 10 s) para que los tests sean deterministas.
  let nowMs = 1_800_000_010_000;
  const config = buildConfig({ DEMO_PASSWORD: TEST_PASSWORD, JWT_SECRET: 'jwt-secret-de-pruebas', ...env });
  const ctx = createContext(config, () => nowMs);
  const server = createApp(ctx).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    ctx,
    advance: (seconds) => {
      nowMs += seconds * 1000;
    },
    nowSeconds: () => Math.floor(nowMs / 1000),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url');
  return { verifier, challenge };
}

export async function postJson(baseUrl: string, path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

export async function getWithToken(baseUrl: string, path: string, token: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

/** Simula el login en el navegador: POST del formulario sin seguir el 302 y extrae code/state. */
export async function authorize(
  baseUrl: string,
  challenge: string,
  state: string,
  password = TEST_PASSWORD,
): Promise<{ status: number; location: string | null }> {
  const form = new URLSearchParams({
    response_type: 'code',
    client_id: 'unisabana-mobile',
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    email: 'estudiante@unisabana.edu.co',
    password,
  });
  const res = await fetch(`${baseUrl}/oauth/authorize`, { method: 'POST', body: form, redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') };
}

export function readQuery(location: string): Record<string, string> {
  const query = location.slice(location.indexOf('?') + 1);
  return Object.fromEntries(new URLSearchParams(query));
}

export interface LoginTokens {
  readonly access_token: string;
  readonly refresh_token: string;
}

export async function login(baseUrl: string): Promise<LoginTokens> {
  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString('base64url');
  const { location } = await authorize(baseUrl, challenge, state);
  if (!location) throw new Error('authorize no devolvió Location');
  const { code } = readQuery(location);
  const res = await postJson(baseUrl, '/auth/oauth/token', {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    client_id: 'unisabana-mobile',
    redirect_uri: REDIRECT_URI,
  });
  if (res.status !== 200) throw new Error(`token devolvió ${res.status}`);
  return (await res.json()) as LoginTokens;
}
