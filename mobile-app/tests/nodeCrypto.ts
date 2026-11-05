/** CryptoProvider para Node: permite probar el núcleo de la app sin el runtime nativo de Expo. */
import { createHash, randomBytes } from 'node:crypto';

import type { CryptoProvider, HashFunction } from '../src/lib/crypto/types';

const digest =
  (algorithm: 'sha1' | 'sha256'): HashFunction =>
  async (data) =>
    new Uint8Array(createHash(algorithm).update(data).digest());

export const nodeCryptoProvider: CryptoProvider = {
  sha1: digest('sha1'),
  sha256: digest('sha256'),
  randomBytes: async (length) => new Uint8Array(randomBytes(length)),
};
