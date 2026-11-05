/**
 * HMAC (RFC 2104) escrito a mano sobre una función hash inyectada:
 *   HMAC(K, m) = H( (K' ⊕ opad) ‖ H( (K' ⊕ ipad) ‖ m ) )
 * donde K' es la clave ajustada al tamaño de bloque (64 bytes para SHA-1 y SHA-256).
 */
import { concatBytes } from './bytes';
import type { HashFunction } from './types';

const BLOCK_SIZE = 64;
const IPAD = 0x36;
const OPAD = 0x5c;

export async function hmac(hash: HashFunction, key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  // 1. Una clave más larga que el bloque se reemplaza por su hash.
  const shortKey = key.length > BLOCK_SIZE ? await hash(key) : key;
  // 2. Se rellena con ceros hasta 64 bytes.
  const blockKey = new Uint8Array(BLOCK_SIZE);
  blockKey.set(shortKey);
  // 3. Se derivan las claves interna y externa con XOR.
  const innerKey = new Uint8Array(BLOCK_SIZE);
  const outerKey = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < BLOCK_SIZE; i += 1) {
    innerKey[i] = blockKey[i] ^ IPAD;
    outerKey[i] = blockKey[i] ^ OPAD;
  }
  // 4. Hash interno sobre el mensaje y hash externo sobre el resultado.
  const innerHash = await hash(concatBytes(innerKey, message));
  return hash(concatBytes(outerKey, innerHash));
}

/** HMAC-SHA1 con el SHA-1 inyectado (20 bytes de salida). */
export function createHmacSha1(sha1: HashFunction) {
  return (key: Uint8Array, message: Uint8Array): Promise<Uint8Array> => hmac(sha1, key, message);
}
