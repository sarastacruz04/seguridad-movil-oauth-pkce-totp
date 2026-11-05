/** Motor TOTP del dispositivo: núcleo propio + SHA-1 nativo de expo-crypto. 100% offline. */
import { expoCryptoProvider } from '../crypto/expoCrypto';
import { createTotpEngine } from './totpCore';

export const totpEngine = createTotpEngine(expoCryptoProvider.sha1);
export const generateTotp = totpEngine.generateTotp;

export { getSecondsRemaining, getTimeStep, TOTP_DIGITS, TOTP_PERIOD_SECONDS } from './totpCore';
export { decodeBase32, InvalidBase32Error, normalizeBase32, validateBase32Secret } from './base32';
export { InvalidOtpauthUriError, parseOtpauthUri } from './otpauth';
export type { TotpAccount } from './types';
