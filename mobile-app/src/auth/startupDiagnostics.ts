/**
 * Diagnóstico del arranque y del retorno del login (solo se muestra en desarrollo, en la Bienvenida).
 * Sirve para ver qué recibió la app cuando Expo Go la reinicia al volver del navegador.
 * Nunca guarda valores completos: el code y el state se enmascaran.
 */
import { createObservable } from '../lib/observable';

const entries = createObservable<readonly string[]>([]);

/** Enmascara code=… y state=… para no mostrar secretos en pantalla. */
export function maskCallbackUrl(url: string | null): string {
  if (url === null) return '(ninguna)';
  return url.replace(/([?&](?:code|state)=)([^&#]{0,6})[^&#]*/g, '$1$2…');
}

export function reportDiagnostic(message: string): void {
  const time = new Date().toLocaleTimeString();
  entries.set([...entries.get(), `${time} · ${message}`].slice(-12));
}

export const startupDiagnostics = {
  subscribe: entries.subscribe,
  getSnapshot: entries.get,
};
