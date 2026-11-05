/**
 * Núcleo HOTP (RFC 4226) / TOTP (RFC 6238) escrito desde cero. Solo depende de un SHA-1
 * inyectado; el HMAC, el contador de 64 bits y el truncamiento dinámico son nuestros.
 * No hace ninguna petición de red: funciona en Modo Avión.
 */
import { createHmacSha1 } from '../crypto/hmac';
import type { HashFunction } from '../crypto/types';
import { decodeBase32 } from './base32';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** T = floor(unixSeconds / 30): cuántas ventanas de 30 s han pasado desde 1970-01-01. */
export function getTimeStep(unixSeconds: number): number {
  return Math.floor(unixSeconds / TOTP_PERIOD_SECONDS);
}

/** Segundos que le quedan a la ventana actual (30 → 1). */
export function getSecondsRemaining(unixSeconds: number): number {
  return TOTP_PERIOD_SECONDS - (Math.floor(unixSeconds) % TOTP_PERIOD_SECONDS);
}

/**
 * T como entero de 64 bits BIG-ENDIAN (8 bytes, byte más significativo primero).
 * Los operadores de bits de JS truncan a 32 bits, así que T se divide aritméticamente en
 * mitad alta (T / 2^32) y mitad baja (T mod 2^32) y se escribe cada una con DataView.
 */
export function counterToBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32), false); // false = big-endian
  view.setUint32(4, counter % 2 ** 32, false);
  return bytes;
}

/** Truncamiento dinámico (RFC 4226 §5.3) EXACTAMENTE como en la guía del laboratorio. */
export function dynamicTruncate(hmacResult: Uint8Array): string {
  const H = hmacResult; // 20 bytes de HMAC-SHA1
  // 1. offset = los 4 bits bajos del último byte (H[19]) → un valor entre 0 y 15.
  const offset = H[19] & 0x0f;
  // 2. Se leen 4 bytes desde offset. "& 0x7F" en el primero apaga el bit más alto para que el
  //    entero de 31 bits sea siempre positivo (evita diferencias entre aritmética con/sin signo).
  const binCode =
    ((H[offset] & 0x7f) << 24) |
    ((H[offset + 1] & 0xff) << 16) |
    ((H[offset + 2] & 0xff) << 8) |
    (H[offset + 3] & 0xff);
  // 3. Módulo 10^6 → 6 dígitos, con ceros a la izquierda (54231 → "054231").
  return String(binCode % 1_000_000).padStart(TOTP_DIGITS, '0');
}

export interface TotpEngine {
  hotp(key: Uint8Array, counter: number): Promise<string>;
  /** API del laboratorio: semilla Base32 + segundos Unix → código de 6 dígitos. */
  generateTotp(secretBase32: string, unixSeconds: number): Promise<string>;
  generateTotpFromKey(key: Uint8Array, unixSeconds: number): Promise<string>;
}

export function createTotpEngine(sha1: HashFunction): TotpEngine {
  const hmacSha1 = createHmacSha1(sha1);

  const hotp = async (key: Uint8Array, counter: number): Promise<string> => {
    const hmacResult = await hmacSha1(key, counterToBytes(counter)); // H = HMAC-SHA1(K, T)
    if (hmacResult.length !== 20) throw new Error('HMAC-SHA1 debe producir 20 bytes');
    return dynamicTruncate(hmacResult);
  };

  const generateTotpFromKey = (key: Uint8Array, unixSeconds: number) => hotp(key, getTimeStep(unixSeconds));

  return {
    hotp,
    generateTotpFromKey,
    generateTotp: (secretBase32, unixSeconds) => generateTotpFromKey(decodeBase32(secretBase32), unixSeconds),
  };
}
