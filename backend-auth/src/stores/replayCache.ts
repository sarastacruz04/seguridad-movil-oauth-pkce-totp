/**
 * Caché anti-replay: cada código TOTP aceptado se recuerda TTL segundos (90 s = las 3 ventanas
 * C-1, C, C+1). Mientras esté en el caché, ese mismo código no puede volver a usarse.
 */
export class ReplayCache {
  private readonly entries = new Map<string, number>(); // clave → expiresAtMs

  constructor(private readonly ttlSeconds: number) {}

  static key(userId: string, code: string): string {
    return `${userId}:${code}`;
  }

  has(key: string, nowMs: number): boolean {
    const expiresAtMs = this.entries.get(key);
    if (expiresAtMs === undefined) return false;
    if (expiresAtMs <= nowMs) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  remember(key: string, nowMs: number): void {
    this.entries.set(key, nowMs + this.ttlSeconds * 1000);
  }

  sweep(nowMs: number): void {
    for (const [key, expiresAtMs] of this.entries) {
      if (expiresAtMs <= nowMs) this.entries.delete(key);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
