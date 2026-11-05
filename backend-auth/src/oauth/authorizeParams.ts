import { ALLOWED_REDIRECT_PREFIXES } from '../config.js';
import { CODE_CHALLENGE_REGEX } from '../lib/pkce.js';

export interface AuthorizeParams {
  readonly responseType: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: string;
  readonly state: string;
}

/**
 * - fatal: no se puede confiar en client_id/redirect_uri → se muestra un error y NUNCA se redirige
 *   (redirigir a un redirect_uri no validado sería un open redirect).
 * - redirect: el redirect_uri es confiable → se devuelve el error a la app (RFC 6749 §4.1.2.1).
 */
export type AuthorizeValidation =
  | { readonly ok: true; readonly params: AuthorizeParams }
  | { readonly ok: false; readonly kind: 'fatal'; readonly message: string }
  | {
      readonly ok: false;
      readonly kind: 'redirect';
      readonly redirectUri: string;
      readonly state: string;
      readonly error: string;
      readonly description: string;
    };

const MAX_REDIRECT_LENGTH = 512;
const STATE_REGEX = /^[A-Za-z0-9\-._~]{16,256}$/;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function isAllowedRedirectUri(uri: string): boolean {
  if (uri.length === 0 || uri.length > MAX_REDIRECT_LENGTH) return false;
  if (/[\s<>"'#\\]/.test(uri)) return false; // sin fragmentos ni caracteres que rompan HTML/URL
  return ALLOWED_REDIRECT_PREFIXES.some((prefix) => uri.startsWith(prefix) && uri.length > prefix.length);
}

/** Añade parámetros respetando si la URI ya trae query (p. ej. exp://host/--/callback?foo=1). */
export function appendQuery(uri: string, params: Readonly<Record<string, string>>): string {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${uri}${uri.includes('?') ? '&' : '?'}${query}`;
}

export function validateAuthorizeParams(source: Readonly<Record<string, unknown>>, expectedClientId: string): AuthorizeValidation {
  const params: AuthorizeParams = {
    responseType: str(source.response_type),
    clientId: str(source.client_id),
    redirectUri: str(source.redirect_uri),
    codeChallenge: str(source.code_challenge),
    codeChallengeMethod: str(source.code_challenge_method),
    state: str(source.state),
  };

  if (params.clientId !== expectedClientId) {
    return { ok: false, kind: 'fatal', message: 'client_id desconocido.' };
  }
  if (!isAllowedRedirectUri(params.redirectUri)) {
    return { ok: false, kind: 'fatal', message: 'redirect_uri no está en la lista permitida.' };
  }

  const fail = (error: string, description: string): AuthorizeValidation => ({
    ok: false,
    kind: 'redirect',
    redirectUri: params.redirectUri,
    state: params.state,
    error,
    description,
  });

  if (!STATE_REGEX.test(params.state)) return fail('invalid_request', 'state es obligatorio (anti-CSRF).');
  if (params.responseType !== 'code') return fail('unsupported_response_type', 'Solo se admite response_type=code.');
  if (params.codeChallengeMethod !== 'S256') {
    return fail('invalid_request', 'code_challenge_method debe ser S256 ("plain" no se acepta).');
  }
  if (!CODE_CHALLENGE_REGEX.test(params.codeChallenge)) {
    return fail('invalid_request', 'code_challenge debe ser Base64URL de 43 caracteres.');
  }
  return { ok: true, params };
}
