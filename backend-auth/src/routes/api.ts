import { Router, type Request, type Response } from 'express';

import { type AppContext, nowSeconds } from '../context.js';
import { authenticate } from '../http.js';
import { signJwt } from '../lib/jwt.js';
import { log, mask } from '../lib/logger.js';

export function apiRouter(ctx: AppContext): Router {
  const router = Router();
  const { config } = ctx;

  // f) Recurso protegido estándar: sirve para demostrar la cola de silent refresh.
  router.get('/api/me', (req, res) => {
    const claims = authenticate(req, res, ctx, ['access', 'elevated']);
    if (!claims) return;
    log('API', `/api/me OK (${claims.typ})`);
    res.json({
      id: claims.sub,
      email: config.demoUser.email,
      name: 'Estudiante UniSabana',
      mfa_verified: claims.mfa_verified,
      token_expires_at: claims.exp,
    });
  });

  // g) Recurso crítico: exige token elevado (mfa_verified:true). Con un access normal → 403 + step_up_token.
  const boveda = (req: Request, res: Response): void => {
    const claims = authenticate(req, res, ctx, ['access', 'elevated']);
    if (!claims) return;

    if (claims.typ !== 'elevated' || !claims.mfa_verified) {
      const stepUpToken = signJwt(
        { sub: claims.sub, typ: 'step_up', mfaVerified: false, ttlSeconds: config.stepUpTtlSeconds, nowSeconds: nowSeconds(ctx) },
        config.jwtSecret,
      );
      log('BOVEDA', `403 mfa_required → step_up ${mask(stepUpToken)}`);
      res.status(403).json({
        error: 'mfa_required',
        message: 'Este recurso exige un segundo factor (TOTP).',
        step_up_token: stepUpToken,
        expires_in: config.stepUpTtlSeconds,
      });
      return;
    }

    log('BOVEDA', '200 acceso concedido con token elevado');
    res.set('Cache-Control', 'no-store').json({
      owner: config.demoUser.email,
      elevated_until: claims.exp,
      items: [
        { label: 'Cuenta de nómina', value: 'Bancolombia ****-4821 · Saldo COP 12.480.300' },
        { label: 'Clave de laboratorio (ficticia)', value: 'LAB-SEC-7Q2X-91ZK' },
        { label: 'Historial clínico', value: 'Grupo O+ · Alergia: penicilina' },
        { label: 'Nota de calificación', value: 'Desarrollo Móvil — Sesión 14: pendiente de sustentación' },
      ],
    });
  };
  router.get('/api/boveda-critica', boveda);
  router.get('/api/boveda', boveda);

  return router;
}
