/**
 * Construcción de la URL de autorización y parseo del deep link de retorno, a mano
 * (encodeURIComponent/decodeURIComponent; sin URL/URLSearchParams, incompletos en React Native).
 */
export interface AuthorizeRequest {
  readonly apiUrl: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly state: string;
}

export function buildAuthorizeUrl(request: AuthorizeRequest): string {
  const params: readonly (readonly [string, string])[] = [
    ['response_type', 'code'],
    ['client_id', request.clientId],
    ['redirect_uri', request.redirectUri],
    ['code_challenge', request.codeChallenge],
    ['code_challenge_method', 'S256'],
    ['state', request.state],
  ];
  const query = params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  return `${request.apiUrl}/oauth/authorize?${query}`;
}

export interface CallbackParams {
  readonly code: string | null;
  readonly state: string | null;
  readonly error: string | null;
  readonly errorDescription: string | null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

/** Extrae code/state/error de "esquema://callback?code=...&state=..." (ignora el fragmento #...). */
export function parseCallbackUrl(url: string): CallbackParams {
  const withoutFragment = url.split('#')[0] ?? '';
  const questionMark = withoutFragment.indexOf('?');
  const values = new Map<string, string>();
  if (questionMark !== -1) {
    for (const pair of withoutFragment.slice(questionMark + 1).split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = safeDecode(eq === -1 ? pair : pair.slice(0, eq));
      // Si un parámetro viene repetido se conserva el PRIMERO (no se deja que un segundo lo pise).
      if (!values.has(key)) values.set(key, eq === -1 ? '' : safeDecode(pair.slice(eq + 1)));
    }
  }
  const get = (key: string): string | null => {
    const value = values.get(key);
    return value === undefined || value === '' ? null : value;
  };
  return { code: get('code'), state: get('state'), error: get('error'), errorDescription: get('error_description') };
}

/**
 * Anti-CSRF: el state recibido debe ser idéntico al generado para ESTE intento.
 * Comparación en tiempo constante (sin salir en el primer carácter distinto).
 */
export function isStateValid(expected: string | null, received: string | null): boolean {
  if (!expected || !received || expected.length !== received.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}
