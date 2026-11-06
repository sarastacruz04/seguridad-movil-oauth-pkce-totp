/** Logs legibles para la sustentación. Nunca se imprime un token completo. */
export function mask(secret: string): string {
  return secret.length <= 6 ? '******' : `${secret.slice(0, 6)}…`;
}

export type LogTag = 'OAUTH' | 'PKCE' | 'TOKEN' | 'REFRESH' | 'LOGOUT' | 'API' | 'BOVEDA' | 'MFA' | 'ENROLL' | 'SERVER' | 'APP';

export function log(tag: LogTag, message: string): void {
  if (process.env.SILENT_LOGS === '1') return; // los tests lo activan para no ensuciar la salida
  const time = new Date().toISOString().slice(11, 19);
  console.log(`${time} [${tag}] ${message}`);
}
