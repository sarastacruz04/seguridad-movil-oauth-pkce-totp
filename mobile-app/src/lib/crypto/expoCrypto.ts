/**
 * Implementación de CryptoProvider sobre expo-crypto (código nativo: CommonCrypto en iOS,
 * java.security en Android). Todo es local: ninguna de estas funciones usa la red.
 */
import * as Crypto from 'expo-crypto';

import type { CryptoProvider, HashFunction } from './types';

function digestWith(algorithm: Crypto.CryptoDigestAlgorithm): HashFunction {
  // Crypto.digest exige un BufferSource respaldado por ArrayBuffer (no SharedArrayBuffer): se copia
  // a un Uint8Array propio. Devuelve un ArrayBuffer, que se envuelve para trabajar byte a byte.
  return async (data) => new Uint8Array(await Crypto.digest(algorithm, new Uint8Array(data)));
}

export const expoCryptoProvider: CryptoProvider = {
  sha1: digestWith(Crypto.CryptoDigestAlgorithm.SHA1),
  sha256: digestWith(Crypto.CryptoDigestAlgorithm.SHA256),
  randomBytes: (length) => Crypto.getRandomBytesAsync(length),
};
