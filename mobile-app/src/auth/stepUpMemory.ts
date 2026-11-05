/**
 * Último código TOTP aceptado por el servidor. Solo en memoria y solo para la demo del ataque de
 * repetición (escenario 5): reenviarlo debe producir 409 Conflict.
 */
let lastVerifiedCode: string | null = null;

export const stepUpMemory = {
  getLastCode: (): string | null => lastVerifiedCode,
  setLastCode(code: string): void {
    lastVerifiedCode = code;
  },
};
