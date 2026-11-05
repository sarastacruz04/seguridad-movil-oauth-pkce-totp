import { Router } from 'express';

import { type AppContext, nowSeconds } from '../context.js';
import { bodyString, noStore, sendError } from '../http.js';
import { signJwt, verifyJwt } from '../lib/jwt.js';
import { log, mask } from '../lib/logger.js';
import { verifyTotp } from '../lib/totp.js';
import { ReplayCache } from '../stores/replayCache.js';

const SIX_DIGITS = /^\d{6}$/;

export function sessionRouter(ctx: AppContext): Router {
  const router = Router();
  const { config } = ctx;

  // d) Renovación silenciosa: refresh_token → nuevo access_token SIN elevación (mfa_verified:false).
  router.post('/auth/refresh', (req, res) => {
    noStore(res);
    const refreshToken = bodyString(req, 'refresh_token');
    const validation = refreshToken
      ? ctx.refreshTokens.validate(refreshToken, ctx.clock())
      : ({ ok: false, reason: 'unknown' } as const);
    if (!validation.ok) {
      log('REFRESH', `rechazado (${validation.reason})`);
      sendError(res, 401, 'invalid_grant', 'refresh_token inválido, vencido o revocado. Inicia sesión de nuevo.');
      return;
    }
    const accessToken = signJwt(
      { sub: validation.userId, typ: 'access', mfaVerified: false, ttlSeconds: config.accessTtlSeconds, nowSeconds: nowSeconds(ctx) },
      config.jwtSecret,
    );
    log('REFRESH', `ok → nuevo access ${mask(accessToken)}`);
    res.json({ token_type: 'Bearer', access_token: accessToken, expires_in: config.accessTtlSeconds });
  });

  // e) Cierre de sesión: revoca el refresh_token (idempotente).
  router.post('/auth/logout', (req, res) => {
    const refreshToken = bodyString(req, 'refresh_token');
    const revoked = refreshToken ? ctx.refreshTokens.revoke(refreshToken) : false;
    log('LOGOUT', revoked ? `refresh ${mask(refreshToken)} revocado` : 'refresh desconocido (sin cambios)');
    res.json({ ok: true });
  });

  // h) Verificación del segundo factor (step-up).
  router.post('/auth/mfa/verify', (req, res) => {
    noStore(res);
    const now = ctx.clock();
    const stepUp = verifyJwt(bodyString(req, 'step_up_token'), config.jwtSecret, nowSeconds(ctx));
    if (!stepUp.ok || stepUp.claims.typ !== 'step_up') {
      log('MFA', 'step_up_token inválido o expirado');
      sendError(res, 401, 'invalid_step_up_token', 'El step_up_token es inválido o expiró. Vuelve a abrir la bóveda.');
      return;
    }
    const userId = stepUp.claims.sub;

    if (ctx.mfaFailures.isBlocked(userId, now)) {
      const retryAfter = ctx.mfaFailures.retryAfterSeconds(userId, now);
      log('MFA', `bloqueado por demasiados intentos (reintentar en ${retryAfter}s)`);
      res.set('Retry-After', String(retryAfter));
      sendError(res, 429, 'too_many_attempts', 'Demasiados intentos fallidos. Espera un minuto.');
      return;
    }

    const code = bodyString(req, 'code');
    if (!SIX_DIGITS.test(code)) {
      ctx.mfaFailures.recordFailure(userId, now);
      log('MFA', 'formato inválido (se esperaban 6 dígitos)');
      sendError(res, 400, 'invalid_format', 'El código debe tener exactamente 6 dígitos.');
      return;
    }

    const check = verifyTotp(ctx.totpKey, code, Math.floor(now / 1000));
    if (!check.valid) {
      ctx.mfaFailures.recordFailure(userId, now);
      log('MFA', 'código inválido (no coincide en C-1, C ni C+1)');
      sendError(res, 400, 'invalid_code', 'Código incorrecto o expirado.');
      return;
    }

    const replayKey = ReplayCache.key(userId, code);
    if (ctx.replayCache.has(replayKey, now)) {
      log('MFA', `REPLAY DETECTADO: el código ${code} ya fue usado → 409`);
      sendError(res, 409, 'replay_detected', 'Replay Attack Detected');
      return;
    }
    ctx.replayCache.remember(replayKey, now);

    const elevated = signJwt(
      { sub: userId, typ: 'elevated', mfaVerified: true, ttlSeconds: config.elevatedTtlSeconds, nowSeconds: nowSeconds(ctx) },
      config.jwtSecret,
    );
    const window = check.drift === 0 ? 'C' : check.drift < 0 ? 'C-1' : 'C+1';
    log('MFA', `código OK en ventana ${window} → elevated ${mask(elevated)} (${config.elevatedTtlSeconds}s)`);
    res.json({ token_type: 'Bearer', elevated_token: elevated, expires_in: config.elevatedTtlSeconds });
  });

  return router;
}
