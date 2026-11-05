/**
 * Wrapper tipado de expo-secure-store: iOS Keychain (kSecClassGenericPassword) y Android Keystore
 * (valores cifrados con una clave AES del Keystore). Es el ÚNICO lugar donde se persisten secretos;
 * en la app no existe AsyncStorage.
 */
import * as SecureStore from 'expo-secure-store';

import type { TotpAccount } from '../lib/totp/types';

/**
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY: el secreto solo se puede leer con el teléfono desbloqueado y no
 * viaja en copias de seguridad ni migra a otro dispositivo (opción más restrictiva sin biometría).
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const SECURE_KEYS = {
  refreshToken: 'unisabana.refresh_token',
  totpAccount: 'unisabana.totp_account',
} as const;

type SecureKey = (typeof SECURE_KEYS)[keyof typeof SECURE_KEYS];

export class SecureStorageError extends Error {
  override readonly name = 'SecureStorageError';
}

async function read(key: SecureKey): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, OPTIONS);
  } catch {
    throw new SecureStorageError('No se pudo leer el almacenamiento seguro del dispositivo.');
  }
}

async function write(key: SecureKey, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, OPTIONS);
  } catch {
    throw new SecureStorageError('No se pudo guardar en el almacenamiento seguro del dispositivo.');
  }
}

async function remove(key: SecureKey): Promise<void> {
  await SecureStore.deleteItemAsync(key, OPTIONS);
}

export const refreshTokenStorage = {
  get: () => read(SECURE_KEYS.refreshToken),
  set: (token: string) => write(SECURE_KEYS.refreshToken, token),
  clear: () => remove(SECURE_KEYS.refreshToken),
};

function isTotpAccount(value: unknown): value is TotpAccount {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.secret === 'string' && typeof record.issuer === 'string' && typeof record.accountName === 'string';
}

export const totpAccountStorage = {
  async get(): Promise<TotpAccount | null> {
    const raw = await read(SECURE_KEYS.totpAccount);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isTotpAccount(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  set: (account: TotpAccount) => write(SECURE_KEYS.totpAccount, JSON.stringify(account)),
  clear: () => remove(SECURE_KEYS.totpAccount),
};
