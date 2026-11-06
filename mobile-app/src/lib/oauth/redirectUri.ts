/**
 * Cálculo explícito del redirect_uri de OAuth.
 *
 * Por qué no basta con Linking.createURL(): en Expo Go SDK 58 sobre Android se observó que devuelve
 * el esquema propio ("unisabana-auth://callback"), que Expo Go NO tiene registrado. El navegador
 * del sistema no puede volver a la app y se queda en la página de login. Por eso, si hay señales de
 * que la app corre dentro de Expo Go, se construye la URL de Expo Go a mano:
 *   exp://<host-de-Metro>/--/<ruta>
 * En un build propio (desarrollo o producción) se usa el esquema de app.json: unisabana-auth://callback.
 */
export interface RedirectEnvironment {
  /** Versión de Expo Go (null en un build propio). */
  readonly expoVersion: string | null;
  /** "expo" cuando corre dentro de Expo Go (campo heredado de expo-constants). */
  readonly appOwnership: string | null;
  /** true si existe la configuración de desarrollo de Expo Go. */
  readonly hasExpoGoConfig: boolean;
  /** Host de Metro, p. ej. "10.0.3.247:8081". */
  readonly hostUri: string | null;
  /** URI base de enlaces, p. ej. "exp://10.0.3.247:8081/--/" en Expo Go. */
  readonly linkingUri: string | null;
  /** Resultado de Linking.createURL(path): se usa cuando NO es Expo Go. */
  readonly createdUrl: string;
}

function isExpoUri(uri: string | null): uri is string {
  return uri !== null && /^exps?:\/\//.test(uri);
}

export function isRunningInExpoGo(env: RedirectEnvironment): boolean {
  return env.expoVersion !== null || env.appOwnership === 'expo' || env.hasExpoGoConfig || isExpoUri(env.linkingUri);
}

export function resolveRedirectUri(env: RedirectEnvironment, path: string): string {
  const cleanPath = path.replace(/^\/+/, '');
  if (isRunningInExpoGo(env)) {
    // 1) Base de enlaces de Expo Go ("exp://host:puerto/--/") si está disponible.
    if (isExpoUri(env.linkingUri)) {
      const base = env.linkingUri.replace(/\/--(\/.*)?$/, '').replace(/\/+$/, '');
      return `${base}/--/${cleanPath}`;
    }
    // 2) Host de Metro ("10.0.3.247:8081").
    const host = env.hostUri?.replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
    if (host) return `exp://${host}/--/${cleanPath}`;
  }
  // 3) Build propio: lo que devuelve Linking.createURL (unisabana-auth://callback).
  return env.createdUrl;
}
