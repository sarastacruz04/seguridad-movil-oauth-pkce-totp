import { randomBytes } from 'node:crypto';

export interface AuthCodeRecord {
  readonly codeChallenge: string;
  readonly redirectUri: string;
  readonly clientId: string;
  readonly userId: string;
  readonly expiresAtMs: number;
}

/** Códigos de autorización OAuth en memoria: aleatorios, de vida corta y de UN SOLO USO. */
export class AuthCodeStore {
  private readonly codes = new Map<string, AuthCodeRecord>();

  issue(record: AuthCodeRecord): string {
    const code = randomBytes(32).toString('base64url');
    this.codes.set(code, record);
    return code;
  }

  /**
   * Devuelve el registro y lo BORRA siempre, sea cual sea el resultado posterior del canje:
   * un code interceptado no se puede volver a intentar, ni siquiera con otro verifier.
   */
  consume(code: string): AuthCodeRecord | undefined {
    const record = this.codes.get(code);
    this.codes.delete(code);
    return record;
  }

  sweep(nowMs: number): void {
    for (const [code, record] of this.codes) {
      if (record.expiresAtMs <= nowMs) this.codes.delete(code);
    }
  }
}
