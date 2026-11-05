/**
 * Punto 1 — OAuth 2.0 Authorization Code + PKCE (RFC 7636) desde la app, sin librerías caja negra.
 *
 *  1. Genera code_verifier/code_challenge y un state aleatorio (solo en memoria).
 *  2. Abre el NAVEGADOR DEL SISTEMA (ASWebAuthenticationSession en iOS, Custom Tabs en Android) con
 *     WebBrowser.openAuthSessionAsync. Nada de WebView: la app nunca ve la contraseña.
 *  3. El proveedor redirige al deep link (unisabana-auth://callback o exp://…/--/callback).
 *  4. Se valida el state ANTES de todo; si no coincide se aborta sin llamar a /token.
 *  5. Se canjea code + code_verifier por los tokens.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { exchangeAuthorizationCode } from '../api/endpoints';
import { describeError, OAuthFlowError } from '../api/errors';
import type { TokenResponse } from '../api/responses';
import { logSecurityEvent } from '../api/securityLog';
import { CLIENT_ID, OAUTH_CALLBACK_PATH } from '../config/constants';
import { API_URL, IS_API_CONFIGURED } from '../config/env';
import { buildAuthorizeUrl, isStateValid, parseCallbackUrl } from '../lib/oauth/authorizeRequest';
import { createPkcePair, generateState } from '../lib/pkce';

/** State del intento en curso. Solo en memoria y de UN SOLO USO. */
let pendingState: string | null = null;

/** redirect_uri efectivo: unisabana-auth://callback en un build; exp://<host>:<puerto>/--/callback en Expo Go. */
export function getRedirectUri(): string {
  return Linking.createURL(OAUTH_CALLBACK_PATH);
}

export async function signInWithSystemBrowser(): Promise<TokenResponse> {
  if (!IS_API_CONFIGURED) throw new OAuthFlowError('not_configured');

  const redirectUri = getRedirectUri();
  const { codeVerifier, codeChallenge } = await createPkcePair();
  const state = await generateState();
  pendingState = state;
  logSecurityEvent('info', `PKCE generado (challenge ${codeChallenge.slice(0, 6)}…) · state ${state.slice(0, 6)}…`);

  const authUrl = buildAuthorizeUrl({ apiUrl: API_URL, clientId: CLIENT_ID, redirectUri, codeChallenge, state });
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    // preferEphemeralSession (iOS): sesión privada, sin cookies compartidas → pide credenciales cada vez.
    result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri, { preferEphemeralSession: true });
  } catch (error) {
    pendingState = null;
    throw new OAuthFlowError('provider_error', error instanceof Error ? error.message : undefined);
  }

  // El state se consume aquí pase lo que pase: nunca se reutiliza para otro retorno.
  const expectedState = pendingState;
  pendingState = null;

  if (result.type !== 'success') {
    logSecurityEvent('warn', `Login cancelado por el usuario (${result.type})`);
    throw new OAuthFlowError('cancelled');
  }

  const callback = parseCallbackUrl(result.url);
  if (!isStateValid(expectedState, callback.state)) {
    logSecurityEvent('error', 'state del deep link NO coincide → intercambio abortado (anti-CSRF)');
    throw new OAuthFlowError('state_mismatch');
  }
  if (callback.error) {
    throw new OAuthFlowError('provider_error', callback.errorDescription ?? callback.error);
  }
  if (!callback.code) throw new OAuthFlowError('invalid_callback');

  logSecurityEvent('success', 'Deep link recibido · state verificado · canjeando code + code_verifier');
  try {
    const tokens = await exchangeAuthorizationCode({ code: callback.code, codeVerifier, redirectUri });
    logSecurityEvent('success', `Tokens recibidos · access ${tokens.accessToken.slice(0, 6)}… (RAM) · refresh → SecureStore`);
    return tokens;
  } catch (error) {
    throw new OAuthFlowError('exchange_failed', describeError(error));
  }
}
