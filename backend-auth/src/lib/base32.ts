/**
 * Decodificador Base32 (RFC 4648 §6) escrito a mano. Es el formato en que viajan las semillas TOTP
 * (otpauth://...&secret=JBSWY3DPEHPK3PXP).
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const MIN_SECRET_LENGTH = 16; // 16 caracteres Base32 = 80 bits

export class InvalidBase32Error extends Error {
  override readonly name = 'InvalidBase32Error';
}

/** Quita espacios, guiones y relleno "=", y pasa a mayúsculas. */
export function normalizeBase32(input: string): string {
  return input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
}

export function decodeBase32(input: string): Uint8Array {
  const clean = normalizeBase32(input);
  if (clean.length < MIN_SECRET_LENGTH) {
    throw new InvalidBase32Error(`La semilla debe tener al menos ${MIN_SECRET_LENGTH} caracteres Base32`);
  }

  const out: number[] = [];
  let buffer = 0; // acumulador de bits
  let bits = 0; // cuántos bits válidos hay en el acumulador

  for (const char of clean) {
    const value = ALPHABET.indexOf(char);
    if (value === -1) {
      throw new InvalidBase32Error(`Carácter inválido "${char}": solo se permiten A–Z y 2–7`);
    }
    // Cada carácter aporta 5 bits; cuando hay 8 o más, sale un byte.
    buffer = ((buffer << 5) | value) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}
