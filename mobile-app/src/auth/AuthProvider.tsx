/**
 * Estado de sesión de la app: "loading" | "signedOut" | "signedIn".
 *
 * Arranque en frío: el access_token solo vivía en RAM, así que al abrir la app no existe. Si hay
 * refresh_token en SecureStore se hace un silent refresh detrás del splash. Si el servidor lo
 * rechaza → signedOut. Si no hay red → signedIn en modo sin conexión (el Authenticator funciona
 * offline y el refresh_token se conserva).
 */
import * as Linking from 'expo-linking';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { refreshAccessToken } from '../api/client';
import { revokeRefreshToken } from '../api/endpoints';
import { describeError, NetworkError, SessionExpiredError } from '../api/errors';
import type { TokenResponse } from '../api/responses';
import { logSecurityEvent } from '../api/securityLog';
import { refreshTokenStorage } from '../storage/secureStorage';
import { resumeSignInFromUrl, signInWithSystemBrowser } from './oauthFlow';
import { maskCallbackUrl, reportDiagnostic } from './startupDiagnostics';
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

  /** Guarda los tokens del login: access → RAM, refresh → Keychain / Keystore. */
  const acceptTokens = useCallback(async (tokens: TokenResponse) => {
    tokenStore.setAccessToken(tokens.accessToken);
    await refreshTokenStorage.set(tokens.refreshToken);
    setNotice(null);
    setStartedOffline(false);
    setStatus('signedIn');
  }, []);

  /** Retoma un login interrumpido por un reinicio de la app (deep link con el intento en SecureStore). */
  const tryResumeSignIn = useCallback(
    async (url: string | null, origin: 'arranque' | 'evento'): Promise<boolean> => {
      try {
        const tokens = await resumeSignInFromUrl(url, origin);
        if (!tokens) return false;
        await acceptTokens(tokens);
        return true;
      } catch (error) {
        setNotice(describeError(error));
        setStatus('signedOut');
        return true;
      }
    },
    [acceptTokens],
  );

  // Arranque en frío.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ¿La app se abrió con el enlace de retorno del login? (Expo Go en Android reinicia la app.)
      const initialUrl = await Linking.getInitialURL().catch(() => null);
      const linkingUrl = Linking.getLinkingURL();
      reportDiagnostic(`Arranque de la app · getInitialURL=${maskCallbackUrl(initialUrl)} · getLinkingURL=${maskCallbackUrl(linkingUrl)}`);
      if (await tryResumeSignIn(initialUrl ?? linkingUrl, 'arranque')) return;
      if (linkingUrl && linkingUrl !== initialUrl && (await tryResumeSignIn(linkingUrl, 'arranque'))) return;

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
  }, [tryResumeSignIn]);

  // Enlace de retorno recibido con la app ya abierta pero sin un login en curso en memoria.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void tryResumeSignIn(url, 'evento');
    });
    return () => subscription.remove();
  }, [tryResumeSignIn]);

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
    await acceptTokens(await signInWithSystemBrowser());
  }, [acceptTokens]);

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
