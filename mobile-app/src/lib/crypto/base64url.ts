/**
 * Base64URL SIN relleno (RFC 4648 §5), escrito a mano. Igual que Base64 pero con "-" y "_"
 * en lugar de "+" y "/", y sin "=": así el valor viaja tal cual en una URL.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  // Cada bloque de 3 bytes (24 bits) se convierte en 4 caracteres de 6 bits.
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  // Resto: 1 byte → 2 caracteres, 2 bytes → 3 caracteres (sin "=").
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
  } else if (remaining === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63];
  }
  return out;
}
