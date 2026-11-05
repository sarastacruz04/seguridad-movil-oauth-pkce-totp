/** Identificador público del cliente OAuth. No es un secreto: la seguridad la aporta PKCE. */
export const CLIENT_ID = 'unisabana-mobile';

/** Ruta del deep link de retorno: unisabana-auth://callback (build) o exp://host:puerto/--/callback (Expo Go). */
export const OAUTH_CALLBACK_PATH = 'callback';

export const HTTP_TIMEOUT_MS = 10_000;

/** Cuántos eventos conserva el registro de seguridad del laboratorio. */
export const SECURITY_LOG_LIMIT = 80;
