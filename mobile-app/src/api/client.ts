/** Instancias reales de los clientes, conectadas a SecureStore, la memoria y el bus de sesión. */
import { emitSessionExpired } from '../auth/sessionEvents';
import { tokenStore } from '../auth/tokenStore';
import { HTTP_TIMEOUT_MS } from '../config/constants';
import { API_URL } from '../config/env';
import { refreshTokenStorage } from '../storage/secureStorage';
import { createApiClients } from './createApiClients';
import { logSecurityEvent } from './securityLog';

export const { authHttp, apiHttp, refreshAccessToken } = createApiClients({
  baseURL: API_URL,
  timeoutMs: HTTP_TIMEOUT_MS,
  tokens: tokenStore,
  refreshTokens: refreshTokenStorage,
  onSessionExpired: emitSessionExpired,
  log: logSecurityEvent,
});
