/** Decodificador Base32 (RFC 4648 §6) escrito a mano para las semillas TOTP. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// 16 caracteres Base32 = 80 bits: mínimo exigido por el laboratorio (RFC 4226 recomienda ≥ 128 bits en producción).
export const MIN_SECRET_LENGTH = 16;

export class InvalidBase32Error extends Error {
  override readonly name = 'InvalidBase32Error';
}

/** Quita espacios, guiones y "=" finales; pasa a mayúsculas. "jbsw y3dp-..." → "JBSWY3DP..." */
export function normalizeBase32(input: string): string {
  return input.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
}

/** Valida sin lanzar: devuelve el mensaje de error en español o null si es válida. */
export function validateBase32Secret(input: string): string | null {
  const clean = normalizeBase32(input);
  if (clean.length === 0) return 'Pega la semilla Base32.';
  const invalid = [...clean].find((char) => !ALPHABET.includes(char));
  if (invalid !== undefined) return `Carácter inválido "${invalid}": solo se permiten letras A–Z y dígitos 2–7.`;
  if (clean.length < MIN_SECRET_LENGTH) {
    return `Muy corta: ${clean.length} de al menos ${MIN_SECRET_LENGTH} caracteres.`;
  }
  return null;
}

export function decodeBase32(input: string): Uint8Array {
  const error = validateBase32Secret(input);
  if (error) throw new InvalidBase32Error(error);
  const clean = normalizeBase32(input);

  const out: number[] = [];
  let buffer = 0; // acumulador de bits
  let bits = 0; // bits válidos en el acumulador
  for (const char of clean) {
    // Cada carácter aporta 5 bits; cada vez que se juntan 8, sale un byte.
    buffer = ((buffer << 5) | ALPHABET.indexOf(char)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}
