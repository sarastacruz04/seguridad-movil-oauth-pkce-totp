/** Registro observable de eventos de seguridad (en memoria) para la pantalla Laboratorio. */
import { SECURITY_LOG_LIMIT } from '../config/constants';
import { createObservable } from '../lib/observable';

export type SecurityEventLevel = 'info' | 'warn' | 'success' | 'error';

export interface SecurityEvent {
  readonly id: number;
  readonly atMs: number;
  readonly level: SecurityEventLevel;
  readonly message: string;
}

const events = createObservable<readonly SecurityEvent[]>([]);
let nextId = 1;

export function logSecurityEvent(level: SecurityEventLevel, message: string): void {
  const event: SecurityEvent = { id: nextId++, atMs: Date.now(), level, message };
  events.set([event, ...events.get()].slice(0, SECURITY_LOG_LIMIT));
}

export const securityLog = {
  subscribe: events.subscribe,
  getSnapshot: events.get,
  clear: () => events.set([]),
};
