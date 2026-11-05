import { createHash, randomBytes } from 'node:crypto';

interface RefreshRecord {
  readonly userId: string;
  readonly expiresAtMs: number;
  revoked: boolean;
}

export type RefreshValidation =
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly reason: 'unknown' | 'expired' | 'revoked' };

/** SHA-256 del token: si se filtrara la memoria del servidor, los hashes no sirven para autenticarse. */
function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** refresh_tokens opacos (32 bytes aleatorios). El servidor solo guarda su hash. */
export class RefreshTokenStore {
  private readonly tokens = new Map<string, RefreshRecord>();

  issue(userId: string, ttlSeconds: number, nowMs: number): string {
    const token = randomBytes(32).toString('base64url');
    this.tokens.set(hashToken(token), { userId, expiresAtMs: nowMs + ttlSeconds * 1000, revoked: false });
    return token;
  }

  validate(token: string, nowMs: number): RefreshValidation {
    const record = this.tokens.get(hashToken(token));
    if (!record) return { ok: false, reason: 'unknown' };
    if (record.revoked) return { ok: false, reason: 'revoked' };
    if (record.expiresAtMs <= nowMs) return { ok: false, reason: 'expired' };
    return { ok: true, userId: record.userId };
  }

  revoke(token: string): boolean {
    const record = this.tokens.get(hashToken(token));
    if (!record) return false;
    record.revoked = true;
    return true;
  }

  sweep(nowMs: number): void {
    for (const [hash, record] of this.tokens) {
      if (record.expiresAtMs <= nowMs) this.tokens.delete(hash);
    }
  }
}
