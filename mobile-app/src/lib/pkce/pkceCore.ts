/**
 * PKCE (RFC 7636) escrito a mano, con el CSPRNG y el SHA-256 inyectados.
 *   code_verifier  = BASE64URL(48 bytes aleatorios)          → 64 caracteres [A-Za-z0-9-_]
 *   code_challenge = BASE64URL(SHA256(ASCII(code_verifier))) → 43 caracteres
 */
import { base64UrlEncode } from '../crypto/base64url';
import { asciiToBytes } from '../crypto/bytes';
import type { HashFunction, RandomBytesFunction } from '../crypto/types';

export const CODE_VERIFIER_REGEX = /^[A-Za-z0-9\-._~]{43,128}$/;
const VERIFIER_RANDOM_BYTES = 48; // 384 bits de entropía
const STATE_RANDOM_BYTES = 16; // 128 bits: imposible de adivinar para un atacante CSRF

export class InvalidCodeVerifierError extends Error {
  override readonly name = 'InvalidCodeVerifierError';
}

export async function generateCodeVerifier(randomBytes: RandomBytesFunction): Promise<string> {
  const verifier = base64UrlEncode(await randomBytes(VERIFIER_RANDOM_BYTES));
  if (!CODE_VERIFIER_REGEX.test(verifier)) throw new InvalidCodeVerifierError('code_verifier fuera de especificación');
  return verifier;
}

export async function computeCodeChallenge(sha256: HashFunction, codeVerifier: string): Promise<string> {
  if (!CODE_VERIFIER_REGEX.test(codeVerifier)) {
    throw new InvalidCodeVerifierError('code_verifier debe tener 43–128 caracteres [A-Za-z0-9-._~]');
  }
  return base64UrlEncode(await sha256(asciiToBytes(codeVerifier)));
}

/** state anti-CSRF: aleatorio, único por intento y de un solo uso. */
export async function generateState(randomBytes: RandomBytesFunction): Promise<string> {
  return base64UrlEncode(await randomBytes(STATE_RANDOM_BYTES));
}

export interface PkcePair {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
}

export async function createPkcePair(randomBytes: RandomBytesFunction, sha256: HashFunction): Promise<PkcePair> {
  const codeVerifier = await generateCodeVerifier(randomBytes);
  return { codeVerifier, codeChallenge: await computeCodeChallenge(sha256, codeVerifier) };
}
