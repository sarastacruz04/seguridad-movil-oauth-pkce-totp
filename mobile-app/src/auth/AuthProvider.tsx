/**
 * Estado de sesión de la app: "loading" | "signedOut" | "signedIn".
 *
 * Arranque en frío: el access_token solo vivía en RAM, así que al abrir la app no existe. Si hay
 * refresh_token en SecureStore se hace un silent refresh detrás del splash. Si el servidor lo
 * rechaza → signedOut. Si no hay red → signedIn en modo sin conexión (el Authenticator funciona
 * offline y el refresh_token se conserva).
 */
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { refreshAccessToken } from '../api/client';
import { revokeRefreshToken } from '../api/endpoints';
import { describeError, NetworkError, SessionExpiredError } from '../api/errors';
import { logSecurityEvent } from '../api/securityLog';
import { refreshTokenStorage } from '../storage/secureStorage';
import { signInWithSystemBrowser } from './oauthFlow';
import { onSessionExpired } from './sessionEvents';
import { tokenStore } from './tokenStore';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  readonly status: SessionStatus;
  /** Aviso para la pantalla de bienvenida (p. ej. "Tu sesión expiró"). */
  readonly notice: string | null;
  /** true si el arranque no pudo contactar al servidor (se conserva la sesión). */
  readonly startedOffline: boolean;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  clearNotice(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [startedOffline, setStartedOffline] = useState(false);

  // Arranque en frío.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hasRefreshToken = (await refreshTokenStorage.get().catch(() => null)) !== null;
      if (!hasRefreshToken) {
        if (!cancelled) setStatus('signedOut');
        return;
      }
      try {
        await refreshAccessToken();
        logSecurityEvent('success', 'Arranque en frío: sesión restaurada con el refresh_token de SecureStore');
        if (!cancelled) setStatus('signedIn');
      } catch (error) {
        if (cancelled) return;
        if (error instanceof NetworkError) {
          setStartedOffline(true);
          setStatus('signedIn');
        } else {
          setNotice(error instanceof SessionExpiredError ? error.userMessage : describeError(error));
          setStatus('signedOut');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Expiración definitiva avisada por el cliente HTTP (refresh rechazado).
  useEffect(
    () =>
      onSessionExpired(() => {
        setNotice('Tu sesión expiró. Por seguridad, inicia sesión de nuevo.');
        setStatus('signedOut');
      }),
    [],
  );

  const signIn = useCallback(async () => {
    setNotice(null);
    const tokens = await signInWithSystemBrowser();
    tokenStore.setAccessToken(tokens.accessToken); // RAM
    await refreshTokenStorage.set(tokens.refreshToken); // Keychain / Keystore
    setStartedOffline(false);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    const refreshToken = await refreshTokenStorage.get().catch(() => null);
    if (refreshToken) await revokeRefreshToken(refreshToken).catch(() => undefined); // mejor esfuerzo
    await refreshTokenStorage.clear();
    tokenStore.clearAll();
    logSecurityEvent('info', 'Sesión cerrada: refresh_token revocado y borrado, memoria limpia');
    setStatus('signedOut');
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, notice, startedOffline, signIn, signOut, clearNotice }),
    [status, notice, startedOffline, signIn, signOut, clearNotice],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return context;
}
