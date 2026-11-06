/**
 * Punto 1 — OAuth 2.0 Authorization Code + PKCE (RFC 7636) desde la app, sin librerías caja negra.
 *
 *  1. Genera code_verifier/code_challenge y un state aleatorio, únicos por intento.
 *  2. Abre el NAVEGADOR DEL SISTEMA (ASWebAuthenticationSession en iOS, Custom Tabs en Android) con
 *     WebBrowser.openAuthSessionAsync. Nada de WebView: la app nunca ve la contraseña.
 *  3. El proveedor redirige al deep link (unisabana-auth://callback o exp://…/--/callback).
 *  4. Se valida el state ANTES de todo; si no coincide se aborta sin llamar a /token.
 *  5. Se canjea code + code_verifier por los tokens.
 *
 * El intento en curso (state + verifier) vive en memoria y, mientras el navegador está abierto, también
 * cifrado en SecureStore: en Android (Expo Go, o si el sistema mata el proceso) la app puede REINICIARSE
 * al recibir el deep link y perdería la memoria. Al arrancar con el enlace de retorno se retoma el login
 * (resumeSignInFromUrl). El intento caduca y es de un solo uso.
 */
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { exchangeAuthorizationCode } from '../api/endpoints';
import { describeError, OAuthFlowError } from '../api/errors';
import type { TokenResponse } from '../api/responses';
import { logSecurityEvent } from '../api/securityLog';
import { CLIENT_ID, OAUTH_CALLBACK_PATH } from '../config/constants';
import { API_URL, IS_API_CONFIGURED } from '../config/env';
import { buildAuthorizeUrl, isStateValid, parseCallbackUrl } from '../lib/oauth/authorizeRequest';
import { resolveRedirectUri } from '../lib/oauth/redirectUri';
import { createPkcePair, generateState } from '../lib/pkce';
import { type PendingAuthorization, pendingAuthorizationStorage } from '../storage/secureStorage';

/** Cuánto se espera el deep link si Android reporta "navegador cerrado" antes de que llegue. */
const ANDROID_REDIRECT_GRACE_MS = 3000;
/** Vida máxima de un intento de login guardado (el code del servidor dura 60 s). */
const PENDING_TTL_MS = 10 * 60 * 1000;

/** true mientras el navegador del login está abierto (lo maneja signInWithSystemBrowser). */
let flowInProgress = false;
/** Enlaces de retorno ya procesados: un mismo deep link nunca se canjea dos veces. */
const handledCallbackUrls = new Set<string>();

/**
 * En Android, openAuthSessionAsync compite entre "la app volvió a primer plano" (→ dismiss) y
 * "llegó el deep link" (→ success), y gana el primero. A veces gana el dismiss aunque el deep link
 * con el code esté llegando. Por eso se escucha el deep link desde que se abre el navegador y, si
 * hace falta, se espera un poco. El state se valida igual después.
 */
function captureRedirect(redirectUri: string): { waitForUrl(timeoutMs: number): Promise<string | null>; stop(): void } {
  let captured: string | null = null;
  let notify: ((url: string) => void) | null = null;
  const subscription = Linking.addEventListener('url', ({ url }) => {
    if (!url.startsWith(redirectUri)) return;
    captured = url;
    notify?.(url);
  });
  return {
    waitForUrl(timeoutMs) {
      if (captured) return Promise.resolve(captured);
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        notify = (url) => {
          clearTimeout(timer);
          resolve(url);
        };
      });
    },
    stop: () => subscription.remove(),
  };
}

/**
 * redirect_uri efectivo: exp://<host>:<puerto>/--/callback en Expo Go; unisabana-auth://callback en un build.
 * No se confía solo en Linking.createURL (ver lib/oauth/redirectUri.ts).
 */
export function getRedirectUri(): string {
  return resolveRedirectUri(
    {
      expoVersion: Constants.expoVersion ?? null,
      appOwnership: Constants.appOwnership ?? null,
      hasExpoGoConfig: Constants.expoGoConfig != null,
      hostUri: Constants.expoConfig?.hostUri ?? null,
      linkingUri: Constants.linkingUri ?? null,
      createdUrl: Linking.createURL(OAUTH_CALLBACK_PATH),
    },
    OAUTH_CALLBACK_PATH,
  );
}

/** ¿Es este enlace un retorno de OAuth (redirect_uri con state)? */
export function isOAuthCallbackUrl(url: string | null): url is string {
  return url !== null && url.startsWith(getRedirectUri()) && parseCallbackUrl(url).state !== null;
}

/** Validación anti-CSRF del retorno + canje del code con el verifier del MISMO intento. */
async function completeAuthorization(callbackUrl: string, pending: PendingAuthorization): Promise<TokenResponse> {
  handledCallbackUrls.add(callbackUrl);
  const callback = parseCallbackUrl(callbackUrl);
  if (!isStateValid(pending.state, callback.state)) {
    logSecurityEvent('error', 'state del deep link NO coincide → intercambio abortado (anti-CSRF)');
    throw new OAuthFlowError('state_mismatch');
  }
  if (callback.error) {
    throw new OAuthFlowError('provider_error', callback.errorDescription ?? callback.error);
  }
  if (!callback.code) throw new OAuthFlowError('invalid_callback');

  logSecurityEvent('success', 'Deep link recibido · state verificado · canjeando code + code_verifier');
  try {
    const tokens = await exchangeAuthorizationCode({
      code: callback.code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
    });
    logSecurityEvent('success', `Tokens recibidos · access ${tokens.accessToken.slice(0, 6)}… (RAM) · refresh → SecureStore`);
    return tokens;
  } catch (error) {
    throw new OAuthFlowError('exchange_failed', describeError(error));
  }
}

export async function signInWithSystemBrowser(): Promise<TokenResponse> {
  if (!IS_API_CONFIGURED) throw new OAuthFlowError('not_configured');

  const redirectUri = getRedirectUri();
  const { codeVerifier, codeChallenge } = await createPkcePair();
  const state = await generateState();
  const pending: PendingAuthorization = { state, codeVerifier, redirectUri, expiresAtMs: Date.now() + PENDING_TTL_MS };
  logSecurityEvent('info', `PKCE generado (challenge ${codeChallenge.slice(0, 6)}…) · state ${state.slice(0, 6)}…`);

  const authUrl = buildAuthorizeUrl({ apiUrl: API_URL, clientId: CLIENT_ID, redirectUri, codeChallenge, state });
  flowInProgress = true;
  const redirectCapture = captureRedirect(redirectUri);
  let callbackUrl: string | null;
  try {
    await pendingAuthorizationStorage.set(pending); // por si la app se reinicia con el navegador abierto
    // preferEphemeralSession (iOS): sesión privada, sin cookies compartidas → pide credenciales cada vez.
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri, { preferEphemeralSession: true });
    callbackUrl = result.type === 'success' ? result.url : await redirectCapture.waitForUrl(ANDROID_REDIRECT_GRACE_MS);
    if (result.type !== 'success' && callbackUrl) {
      logSecurityEvent('info', 'Android: el navegador se reportó cerrado antes que el deep link; se recuperó el redirect');
    }
  } catch (error) {
    throw new OAuthFlowError('provider_error', error instanceof Error ? error.message : undefined);
  } finally {
    redirectCapture.stop();
    // El intento se consume aquí pase lo que pase: nunca se reutiliza para otro retorno.
    flowInProgress = false;
    await pendingAuthorizationStorage.clear();
  }

  if (!callbackUrl) {
    logSecurityEvent('warn', 'Login cancelado por el usuario (se cerró el navegador sin volver con un code)');
    throw new OAuthFlowError('cancelled');
  }
  return completeAuthorization(callbackUrl, pending);
}

/**
 * La app se abrió (o reabrió) con el enlace de retorno pero sin el intento en memoria: típico de Expo Go
 * en Android, que reinicia la app al recibir el deep link. Se retoma con el intento guardado en
 * SecureStore, que se borra antes de usarlo (un solo uso). Devuelve null si no hay nada que retomar.
 */
export async function resumeSignInFromUrl(url: string | null): Promise<TokenResponse | null> {
  if (flowInProgress || !isOAuthCallbackUrl(url) || handledCallbackUrls.has(url)) return null;
  handledCallbackUrls.add(url);

  const pending = await pendingAuthorizationStorage.get().catch(() => null);
  await pendingAuthorizationStorage.clear();
  if (!pending) return null;
  if (pending.expiresAtMs <= Date.now()) {
    logSecurityEvent('warn', 'Retorno de login con un intento caducado: se descarta');
    return null;
  }
  logSecurityEvent('info', 'La app se reinició durante el login: se retoma el intento guardado en SecureStore');
  return completeAuthorization(url, pending);
}
