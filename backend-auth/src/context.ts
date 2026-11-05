import type { AppConfig } from './config.js';
import { decodeBase32 } from './lib/base32.js';
import { AuthCodeStore } from './stores/authCodeStore.js';
import { FailureRateLimiter } from './stores/failureRateLimiter.js';
import { RefreshTokenStore } from './stores/refreshTokenStore.js';
import { ReplayCache } from './stores/replayCache.js';

/** Reloj inyectable (milisegundos Unix) para poder probar ventanas TOTP y expiraciones. */
export type Clock = () => number;

export interface AppContext {
  readonly config: AppConfig;
  readonly clock: Clock;
  readonly totpKey: Uint8Array;
  readonly authCodes: AuthCodeStore;
  readonly refreshTokens: RefreshTokenStore;
  readonly replayCache: ReplayCache;
  readonly mfaFailures: FailureRateLimiter;
}

export function createContext(config: AppConfig, clock: Clock = Date.now): AppContext {
  return {
    config,
    clock,
    totpKey: decodeBase32(config.totpSecret),
    authCodes: new AuthCodeStore(),
    refreshTokens: new RefreshTokenStore(),
    replayCache: new ReplayCache(config.replayTtlSeconds),
    mfaFailures: new FailureRateLimiter(config.maxFailedMfaPerMinute),
  };
}

export function nowSeconds(ctx: AppContext): number {
  return Math.floor(ctx.clock() / 1000);
}

/** Limpieza periódica de todo lo que caduca en memoria. */
export function sweepExpired(ctx: AppContext): void {
  const now = ctx.clock();
  ctx.authCodes.sweep(now);
  ctx.refreshTokens.sweep(now);
  ctx.replayCache.sweep(now);
  ctx.mfaFailures.sweep(now);
}
