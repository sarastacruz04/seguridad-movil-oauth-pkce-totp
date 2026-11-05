/**
 * HOTP (RFC 4226) y TOTP (RFC 6238) escritos a mano. node:crypto solo aporta HMAC-SHA1;
 * el contador, el truncamiento dinámico y la verificación por ventanas son nuestros.
 */
import { createHmac } from 'node:crypto';

import { safeEqual } from './safeEqual.js';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
const MODULO = 10 ** TOTP_DIGITS; // 1_000_000

/** T = floor(unixSeconds / 30): número de ventanas de 30 s desde el epoch Unix. */
export function timeStep(unixSeconds: number): number {
  return Math.floor(unixSeconds / TOTP_PERIOD_SECONDS);
}

/**
 * El contador va como entero de 64 bits big-endian (8 bytes). JS no tiene enteros de 64 bits
 * con operadores de bits, así que se parte en dos mitades de 32 bits con aritmética normal.
 */
export function counterToBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32)); // 32 bits altos
  view.setUint32(4, counter % 2 ** 32); // 32 bits bajos
  return bytes;
}

/** Truncamiento dinámico (RFC 4226 §5.3), exactamente como en la guía. */
export function dynamicTruncate(hmac: Uint8Array): string {
  if (hmac.length !== 20) throw new Error('HMAC-SHA1 debe tener 20 bytes');
  // 1. Los 4 bits bajos del último byte dicen dónde empieza el fragmento (0..15).
  const offset = hmac[19]! & 0x0f;
  // 2. Se toman 4 bytes desde offset; el primero se enmascara con 0x7f para descartar el bit de signo.
  const binCode =
    ((hmac[offset]! & 0x7f) << 24) | ((hmac[offset + 1]! & 0xff) << 16) | ((hmac[offset + 2]! & 0xff) << 8) | (hmac[offset + 3]! & 0xff);
  // 3. Se reduce a 6 dígitos y se rellena con ceros a la izquierda (054231).
  return String(binCode % MODULO).padStart(TOTP_DIGITS, '0');
}

export function hotp(key: Uint8Array, counter: number): string {
  const hmac = createHmac('sha1', key).update(counterToBytes(counter)).digest();
  return dynamicTruncate(new Uint8Array(hmac));
}

export function totp(key: Uint8Array, unixSeconds: number): string {
  return hotp(key, timeStep(unixSeconds));
}

export type TotpVerification =
  { readonly valid: true; readonly matchedStep: number; readonly drift: -1 | 0 | 1 } | { readonly valid: false };

const DRIFTS = [-1, 0, 1] as const;

/**
 * Verifica el código en las ventanas C-1, C y C+1 (tolerancia de ±30 s de desfase de reloj).
 * Se comparan siempre las tres ventanas en tiempo constante, sin salir antes, para no filtrar
 * por tiempos de respuesta en qué ventana estaba el código.
 */
export function verifyTotp(key: Uint8Array, code: string, unixSeconds: number): TotpVerification {
  const current = timeStep(unixSeconds);
  let result: TotpVerification = { valid: false };
  for (const drift of DRIFTS) {
    const step = current + drift;
    if (safeEqual(hotp(key, step), code) && !result.valid) {
      result = { valid: true, matchedStep: step, drift };
    }
  }
  return result;
}
