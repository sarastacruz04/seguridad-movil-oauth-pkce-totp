/** Endpoints del backend-auth con respuestas validadas y errores tipados. */
import { CLIENT_ID } from '../config/constants';
import { apiHttp, authHttp } from './client';
import { toAppError } from './errors';
import {
  parseElevatedResponse,
  parseProfile,
  parseTokenResponse,
  parseVault,
  type Profile,
  type TokenResponse,
  type Vault,
} from './responses';

export interface CodeExchange {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
}

/** Canje del authorization_code + code_verifier (instancia SIN interceptores). */
export async function exchangeAuthorizationCode({ code, codeVerifier, redirectUri }: CodeExchange): Promise<TokenResponse> {
  try {
    const { data } = await authHttp.post('/auth/oauth/token', {
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
    });
    return parseTokenResponse(data);
  } catch (error) {
    throw toAppError(error);
  }
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await authHttp.post('/auth/logout', { refresh_token: refreshToken });
}

export async function fetchProfile(): Promise<Profile> {
  const { data } = await apiHttp.get('/api/me');
  return parseProfile(data);
}

/**
 * Bóveda crítica. Sin token elevado usa el access_token normal (→ 403 mfa_required → MfaRequiredError).
 * Con token elevado lo envía explícitamente; si venció → ElevationExpiredError.
 */
export async function fetchVault(elevatedToken: string | null): Promise<Vault> {
  const { data } = elevatedToken
    ? await apiHttp.get('/api/boveda-critica', { authMode: 'elevated', headers: { Authorization: `Bearer ${elevatedToken}` } })
    : await apiHttp.get('/api/boveda-critica');
  return parseVault(data);
}

/** Verificación del segundo factor (instancia SIN interceptores: un 400/409/429 no toca la sesión). */
export async function verifyMfaCode(stepUpToken: string, code: string): Promise<{ elevatedToken: string; expiresIn: number }> {
  try {
    const { data } = await authHttp.post('/auth/mfa/verify', { step_up_token: stepUpToken, code });
    return parseElevatedResponse(data);
  } catch (error) {
    throw toAppError(error);
  }
}
