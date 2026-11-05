/**
 * Clientes HTTP de la app.
 *  - authHttp: SIN interceptores. Solo para /auth/* (canje de code, refresh, verify MFA, logout).
 *  - apiHttp:  CON interceptores. Agrega el Bearer y resuelve los 401 con la cola de refresh silencioso.
 *
 * Cola silenciosa: ante un 401 se crea UNA sola promesa de refresh. Toda petición que reciba 401
 * mientras tanto, o que se intente enviar mientras tanto, espera esa MISMA promesa; al resolverse,
 * cada una se reintenta una vez con el token nuevo. Resultado: N peticiones concurrentes → 1 refresh.
 *
 * Las dependencias se inyectan (sin imports de Expo) para poder probar la cola en Node.
 */
import { type AxiosInstance, create, type InternalAxiosRequestConfig, isAxiosError } from 'axios';

import type { SessionExpiredReason } from '../auth/sessionEvents';
import { ElevationExpiredError, MfaRequiredError, NetworkError, readErrorBody, SessionExpiredError, toAppError } from './errors';
import { parseRefreshResponse } from './responses';
import type { SecurityEventLevel } from './securityLog';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** 'access' (por defecto): usa el access_token en memoria. 'elevated': el llamador pone el token elevado. */
    authMode?: 'access' | 'elevated';
    /** Bandera anti-bucle: una petición solo se reintenta una vez tras un refresh. */
    _retry?: boolean;
    /** Token con el que salió la petición (para detectar si otra petición ya renovó la sesión). */
    _sentToken?: string | null;
  }
}

/** Endpoints de autenticación: un 401 en ellos NUNCA dispara un refresh. */
const AUTH_ENDPOINTS = ['/auth/oauth/token', '/auth/refresh', '/auth/mfa/verify', '/auth/logout'];

export interface ApiClientDeps {
  readonly baseURL: string;
  readonly timeoutMs: number;
  readonly tokens: {
    getAccessToken(): string | null;
    setAccessToken(token: string): void;
    clearAll(): void;
    clearElevatedToken(): void;
  };
  readonly refreshTokens: {
    get(): Promise<string | null>;
    clear(): Promise<void>;
  };
  readonly onSessionExpired: (reason: SessionExpiredReason) => void;
  readonly log: (level: SecurityEventLevel, message: string) => void;
}

export interface ApiClients {
  readonly authHttp: AxiosInstance;
  readonly apiHttp: AxiosInstance;
  /** Renovación compartida (también la usa el arranque en frío). */
  refreshAccessToken(): Promise<string>;
}

function describeRequest(config: InternalAxiosRequestConfig): string {
  return `${(config.method ?? 'get').toUpperCase()} ${config.url ?? ''}`;
}

function isAuthEndpoint(url: string | undefined): boolean {
  return AUTH_ENDPOINTS.some((endpoint) => url?.startsWith(endpoint));
}

export function createApiClients(deps: ApiClientDeps): ApiClients {
  const { tokens, log } = deps;
  const authHttp = create({ baseURL: deps.baseURL, timeout: deps.timeoutMs });
  const apiHttp = create({ baseURL: deps.baseURL, timeout: deps.timeoutMs });

  let refreshInFlight: Promise<string> | null = null;
  let queued = 0;

  async function expireSession(reason: SessionExpiredReason): Promise<void> {
    tokens.clearAll(); // access + elevated en memoria
    await deps.refreshTokens.clear().catch(() => undefined); // refresh en SecureStore
    deps.onSessionExpired(reason);
  }

  async function performRefresh(): Promise<string> {
    const refreshToken = await deps.refreshTokens.get();
    if (!refreshToken) {
      log('error', 'No hay refresh_token en SecureStore → sesión terminada');
      await expireSession('no_refresh_token');
      throw new SessionExpiredError();
    }
    try {
      const { data } = await authHttp.post('/auth/refresh', { refresh_token: refreshToken });
      const { accessToken } = parseRefreshResponse(data);
      tokens.setAccessToken(accessToken);
      log('success', `Refresh OK → nuevo access_token ${accessToken.slice(0, 6)}… · se liberan ${queued} petición(es) en cola`);
      return accessToken;
    } catch (error) {
      if (isAxiosError(error) && error.response && [400, 401].includes(error.response.status)) {
        log('error', `Refresh rechazado (${readErrorBody(error.response.data).code}) → se limpia SecureStore y se cierra sesión`);
        await expireSession('refresh_rejected');
        throw new SessionExpiredError();
      }
      const appError = toAppError(error);
      if (appError instanceof NetworkError) log('warn', 'Refresh sin conexión: se CONSERVA el refresh_token (no se cierra sesión)');
      throw appError;
    }
  }

  function refreshAccessToken(): Promise<string> {
    if (refreshInFlight) {
      queued += 1;
      log('info', `${queued} petición(es) esperando en cola el refresh en curso`);
      return refreshInFlight;
    }
    log('info', 'POST /auth/refresh iniciado (única renovación para toda la cola)');
    queued = 0;
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  // Request: pausa las peticiones nuevas mientras hay un refresh en curso y agrega el Bearer.
  apiHttp.interceptors.request.use(async (config) => {
    if ((config.authMode ?? 'access') !== 'access') return config;
    if (refreshInFlight) {
      queued += 1;
      log('info', `${describeRequest(config)} en pausa hasta que termine el refresh (${queued} en cola)`);
      try {
        await refreshInFlight;
      } catch (error) {
        throw toAppError(error);
      }
    }
    const token = tokens.getAccessToken();
    config._sentToken = token;
    if (token) config.headers.set('Authorization', `Bearer ${token}`);
    return config;
  });

  // Response: 401 → cola de refresh; 403 mfa_required → MfaRequiredError para la pantalla.
  apiHttp.interceptors.response.use(undefined, async (error: unknown) => {
    if (!isAxiosError(error) || !error.config) throw toAppError(error);
    const config = error.config;
    if (!error.response) throw new NetworkError(error.message);

    const { status } = error.response;
    const body = readErrorBody(error.response.data);

    if (status === 403 && body.code === 'mfa_required' && body.stepUpToken) {
      throw new MfaRequiredError(body.stepUpToken); // NO dispara refresh: lo maneja la pantalla
    }
    if (status === 401 && config.authMode === 'elevated') {
      tokens.clearElevatedToken();
      throw new ElevationExpiredError();
    }
    if (status === 401 && !isAuthEndpoint(config.url) && !config._retry) {
      config._retry = true;
      log('warn', `401 recibido en ${describeRequest(config)} (${body.code})`);
      const current = tokens.getAccessToken();
      // Si otra petición ya renovó el token mientras esta viajaba, se reutiliza sin refrescar de nuevo.
      const alreadyRefreshed = current !== null && current !== config._sentToken && !refreshInFlight;
      if (!alreadyRefreshed) await refreshAccessToken();
      const response = await apiHttp.request(config);
      log('success', `Reintento OK: ${describeRequest(config)}`);
      return response;
    }
    throw toAppError(error);
  });

  return { authHttp, apiHttp, refreshAccessToken };
}
