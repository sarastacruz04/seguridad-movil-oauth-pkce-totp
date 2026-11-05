/** Errores tipados de la app. Cada uno se traduce a un mensaje en español para el usuario. */
import { isAxiosError } from 'axios';

export abstract class AppError extends Error {
  abstract readonly userMessage: string;
}

/** Sin respuesta del servidor (sin red, IP equivocada, firewall, timeout). */
export class NetworkError extends AppError {
  override readonly name = 'NetworkError';
  readonly userMessage = 'Sin conexión con el servidor. Revisa la red Wi-Fi y EXPO_PUBLIC_API_URL.';
}

/** El refresh_token fue rechazado: hay que volver a iniciar sesión. */
export class SessionExpiredError extends AppError {
  override readonly name = 'SessionExpiredError';
  readonly userMessage = 'Tu sesión expiró. Inicia sesión de nuevo.';
}

/** 403 mfa_required: el recurso exige segundo factor. Lo captura la PANTALLA, no el interceptor. */
export class MfaRequiredError extends AppError {
  override readonly name = 'MfaRequiredError';
  readonly userMessage = 'Este recurso exige verificación en dos pasos.';
  constructor(readonly stepUpToken: string) {
    super('mfa_required');
  }
}

/** El token elevado venció (10 min): la bóveda vuelve a pedir 2FA. */
export class ElevationExpiredError extends AppError {
  override readonly name = 'ElevationExpiredError';
  readonly userMessage = 'La verificación en dos pasos expiró. Verifica de nuevo.';
}

/** Respuesta HTTP de error con el formato del backend { error, message }. */
export class ApiError extends AppError {
  override readonly name = 'ApiError';
  constructor(
    readonly status: number,
    readonly code: string,
    readonly serverMessage: string,
  ) {
    super(`${status} ${code}`);
  }
  get userMessage(): string {
    return this.serverMessage || `Error del servidor (${this.status}).`;
  }
}

export type OAuthFailureKind =
  'not_configured' | 'cancelled' | 'state_mismatch' | 'provider_error' | 'invalid_callback' | 'exchange_failed';

const OAUTH_MESSAGES: Record<OAuthFailureKind, string> = {
  not_configured: 'Falta configurar EXPO_PUBLIC_API_URL en mobile-app/.env.',
  cancelled: 'Inicio de sesión cancelado.',
  state_mismatch: 'Respuesta rechazada: el parámetro state no coincide (posible ataque CSRF). Se abortó el intercambio.',
  provider_error: 'El proveedor de identidad rechazó la solicitud.',
  invalid_callback: 'El retorno a la app no trae un código de autorización válido.',
  exchange_failed: 'No se pudo canjear el código de autorización.',
};

export class OAuthFlowError extends AppError {
  override readonly name = 'OAuthFlowError';
  constructor(
    readonly kind: OAuthFailureKind,
    readonly detail?: string,
  ) {
    super(kind);
  }
  get userMessage(): string {
    return this.detail ? `${OAUTH_MESSAGES[this.kind]} (${this.detail})` : OAUTH_MESSAGES[this.kind];
  }
}

interface ErrorBody {
  readonly error?: unknown;
  readonly message?: unknown;
  readonly step_up_token?: unknown;
}

export function readErrorBody(data: unknown): { code: string; message: string; stepUpToken: string | null } {
  const body: ErrorBody = typeof data === 'object' && data !== null ? (data as ErrorBody) : {};
  return {
    code: typeof body.error === 'string' ? body.error : 'unknown_error',
    message: typeof body.message === 'string' ? body.message : '',
    stepUpToken: typeof body.step_up_token === 'string' ? body.step_up_token : null,
  };
}

/** Convierte cualquier error (axios u otro) en un AppError tipado. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isAxiosError(error)) {
    if (!error.response) return new NetworkError(error.message);
    const { code, message } = readErrorBody(error.response.data);
    return new ApiError(error.response.status, code, message);
  }
  return new ApiError(0, 'client_error', error instanceof Error ? error.message : 'Error inesperado.');
}

export function describeError(error: unknown): string {
  return toAppError(error).userMessage;
}
