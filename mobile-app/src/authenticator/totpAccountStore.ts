/**
 * Estado compartido de la semilla TOTP (pantalla Authenticator, escáner QR y modal de step-up).
 * La fuente de verdad es SecureStore; aquí solo se refleja para la UI.
 */
import { useEffect, useSyncExternalStore } from 'react';

import { createObservable } from '../lib/observable';
import type { TotpAccount } from '../lib/totp/types';
import { totpAccountStorage } from '../storage/secureStorage';

type AccountState = { readonly status: 'loading' } | { readonly status: 'ready'; readonly account: TotpAccount | null };

const state = createObservable<AccountState>({ status: 'loading' });
let loadStarted = false;

async function load(): Promise<void> {
  loadStarted = true;
  const account = await totpAccountStorage.get().catch(() => null);
  state.set({ status: 'ready', account });
}

export const totpAccountStore = {
  async save(account: TotpAccount): Promise<void> {
    await totpAccountStorage.set(account);
    state.set({ status: 'ready', account });
  },
  async remove(): Promise<void> {
    await totpAccountStorage.clear();
    state.set({ status: 'ready', account: null });
  },
  /** Lectura sin suscripción (modal de step-up). */
  current(): TotpAccount | null {
    const value = state.get();
    return value.status === 'ready' ? value.account : null;
  },
};

export function useTotpAccount(): AccountState {
  useEffect(() => {
    if (!loadStarted) void load();
  }, []);
  return useSyncExternalStore(state.subscribe, state.get);
}
