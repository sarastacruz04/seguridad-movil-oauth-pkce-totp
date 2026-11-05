/** Verificación PKCE del lado servidor (RFC 7636 §4.6). */
import { createHash } from 'node:crypto';

import { safeEqual } from './safeEqual.js';

/** code_verifier: 43..128 caracteres "unreserved" (RFC 3986). */
export const CODE_VERIFIER_REGEX = /^[A-Za-z0-9\-._~]{43,128}$/;
/** code_challenge S256: SHA-256 (32 bytes) en Base64URL sin relleno = exactamente 43 caracteres. */
export const CODE_CHALLENGE_REGEX = /^[A-Za-z0-9_-]{43}$/;

/** BASE64URL(SHA256(ASCII(code_verifier))) */
export function computeS256Challenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
}

export function verifyPkce(codeVerifier: string, storedChallenge: string): boolean {
  if (!CODE_VERIFIER_REGEX.test(codeVerifier)) return false;
  return safeEqual(computeS256Challenge(codeVerifier), storedChallenge);
}
