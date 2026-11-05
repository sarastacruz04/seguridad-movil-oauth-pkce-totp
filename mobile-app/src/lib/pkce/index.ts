/** PKCE del dispositivo: núcleo propio + CSPRNG y SHA-256 nativos de expo-crypto. */
import { expoCryptoProvider } from '../crypto/expoCrypto';
import { createPkcePair as createPair, generateState as generate, type PkcePair } from './pkceCore';

export const createPkcePair = (): Promise<PkcePair> => createPair(expoCryptoProvider.randomBytes, expoCryptoProvider.sha256);
export const generateState = (): Promise<string> => generate(expoCryptoProvider.randomBytes);

export { CODE_VERIFIER_REGEX, type PkcePair } from './pkceCore';
