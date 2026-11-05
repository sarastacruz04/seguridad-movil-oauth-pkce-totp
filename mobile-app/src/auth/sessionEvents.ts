/**
 * Canal de eventos entre la capa de red y la UI. El cliente HTTP avisa aquí cuando la sesión
 * expira de forma definitiva; el AuthProvider escucha y navega a la bienvenida. Así la capa de red
 * no importa componentes ni navegación.
 */
export type SessionExpiredReason = 'refresh_rejected' | 'no_refresh_token';

type Listener = (reason: SessionExpiredReason) => void;
const listeners = new Set<Listener>();

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSessionExpired(reason: SessionExpiredReason): void {
  listeners.forEach((listener) => listener(reason));
}
