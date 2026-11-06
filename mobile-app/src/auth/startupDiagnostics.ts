/**
 * Diagnóstico del arranque y del retorno del login (SOLO en desarrollo).
 * Se muestra en la Bienvenida y además se envía a la consola del backend (POST /dev/diag), porque si
 * Expo Go reinicia la app la pantalla se borra pero la terminal del backend conserva la historia.
 * Nunca incluye valores completos: el code y el state se enmascaran.
 */
import { API_URL, IS_API_CONFIGURED } from '../config/env';
import { createObservable } from '../lib/observable';

const entries = createObservable<readonly string[]>([]);

/** Identifica esta ejecución de la app: si aparecen dos ids distintos, la app se reinició. */
const INSTANCE_ID = Math.random().toString(36).slice(2, 6);

/** Enmascara code=… y state=… para no mostrar secretos. */
export function maskCallbackUrl(url: string | null): string {
  if (url === null) return '(ninguna)';
  return url.replace(/([?&](?:code|state)=)([^&#]{0,6})[^&#]*/g, '$1$2…');
}

function sendToBackend(message: string): void {
  if (!IS_API_CONFIGURED) return;
  fetch(`${API_URL}/dev/diag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instance: INSTANCE_ID, message }),
  }).catch(() => undefined);
}

export function reportDiagnostic(message: string): void {
  if (!__DEV__) return;
  const time = new Date().toLocaleTimeString();
  entries.set([...entries.get(), `${time} [${INSTANCE_ID}] ${message}`].slice(-12));
  sendToBackend(message);
}

export const startupDiagnostics = {
  subscribe: entries.subscribe,
  getSnapshot: entries.get,
};
