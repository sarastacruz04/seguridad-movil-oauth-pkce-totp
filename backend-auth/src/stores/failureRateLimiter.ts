const WINDOW_MS = 60_000;

/** Límite simple de intentos fallidos por usuario en una ventana deslizante de 60 s (anti fuerza bruta). */
export class FailureRateLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(private readonly maxFailures: number) {}

  private recent(userId: string, nowMs: number): number[] {
    const list = (this.failures.get(userId) ?? []).filter((t) => nowMs - t < WINDOW_MS);
    this.failures.set(userId, list);
    return list;
  }

  isBlocked(userId: string, nowMs: number): boolean {
    return this.recent(userId, nowMs).length >= this.maxFailures;
  }

  /** Segundos hasta que caduque el fallo más antiguo de la ventana. */
  retryAfterSeconds(userId: string, nowMs: number): number {
    const oldest = this.recent(userId, nowMs)[0];
    return oldest === undefined ? 0 : Math.ceil((oldest + WINDOW_MS - nowMs) / 1000);
  }

  recordFailure(userId: string, nowMs: number): void {
    this.recent(userId, nowMs).push(nowMs);
  }

  sweep(nowMs: number): void {
    for (const userId of [...this.failures.keys()]) {
      if (this.recent(userId, nowMs).length === 0) this.failures.delete(userId);
    }
  }
}
