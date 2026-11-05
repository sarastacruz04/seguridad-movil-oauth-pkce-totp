/**
 * Tokens de vida corta en MEMORIA VOLÁTIL (variables de módulo). Nunca se persisten: al matar el
 * proceso desaparecen. El access_token dura 5 min y el elevated_token 10 min; el refresh_token
 * (30 días) vive aparte, en SecureStore.
 */
import { createObservable } from '../lib/observable';

interface ElevatedToken {
  readonly token: string;
  readonly expiresAtMs: number;
}

export interface TokenSnapshot {
  readonly hasAccessToken: boolean;
  readonly accessTokenPreview: string | null;
  readonly elevatedExpiresAtMs: number | null;
}

let accessToken: string | null = null;
let elevated: ElevatedToken | null = null;

const snapshot = createObservable<TokenSnapshot>({ hasAccessToken: false, accessTokenPreview: null, elevatedExpiresAtMs: null });

/** Solo los primeros 6 caracteres: nunca se muestra ni se registra un token completo. */
export function maskToken(token: string | null): string | null {
  return token ? `${token.slice(0, 6)}…` : null;
}

function publish(): void {
  snapshot.set({
    hasAccessToken: accessToken !== null,
    accessTokenPreview: maskToken(accessToken),
    elevatedExpiresAtMs: elevated?.expiresAtMs ?? null,
  });
}

export const tokenStore = {
  getAccessToken: (): string | null => accessToken,
  setAccessToken(token: string): void {
    accessToken = token;
    publish();
  },
  /** Para el laboratorio: reemplaza el token por uno inválido para forzar un 401 real del servidor. */
  invalidateAccessToken(): void {
    accessToken = 'token-invalidado-en-memoria';
    publish();
  },

  /** Devuelve el token elevado solo si sigue vigente (si venció, lo descarta). */
  getElevatedToken(nowMs = Date.now()): string | null {
    if (elevated && elevated.expiresAtMs <= nowMs) {
      elevated = null;
      publish();
    }
    return elevated?.token ?? null;
  },
  setElevatedToken(token: string, expiresInSeconds: number): void {
    elevated = { token, expiresAtMs: Date.now() + expiresInSeconds * 1000 };
    publish();
  },
  clearElevatedToken(): void {
    elevated = null;
    publish();
  },

  clearAll(): void {
    accessToken = null;
    elevated = null;
    publish();
  },

  subscribe: snapshot.subscribe,
  getSnapshot: snapshot.get,
};
