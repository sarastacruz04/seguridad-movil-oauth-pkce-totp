/** Conversiones de bytes escritas a mano (sin Buffer, que no existe en React Native). */

export class NonAsciiError extends Error {
  override readonly name = 'NonAsciiError';
}

/** Bytes ASCII de una cadena (RFC 7636 hashea "ASCII(code_verifier)"). */
export function asciiToBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > 0x7f) throw new NonAsciiError(`Carácter no ASCII en la posición ${i}`);
    bytes[i] = code;
  }
  return bytes;
}

/** Codificación UTF-8 manual (para mensajes de los vectores de prueba como "Hi There"). */
export function utf8ToBytes(text: string): Uint8Array {
  const out: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
