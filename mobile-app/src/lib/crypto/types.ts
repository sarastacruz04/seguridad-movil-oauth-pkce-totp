/** Función de hash inyectable: expo-crypto en el dispositivo, node:crypto en los tests. */
export type HashFunction = (data: Uint8Array) => Promise<Uint8Array>;

/** Fuente de bytes aleatorios criptográficamente seguros (CSPRNG del sistema operativo). */
export type RandomBytesFunction = (length: number) => Promise<Uint8Array>;

export interface CryptoProvider {
  readonly sha1: HashFunction;
  readonly sha256: HashFunction;
  readonly randomBytes: RandomBytesFunction;
}
