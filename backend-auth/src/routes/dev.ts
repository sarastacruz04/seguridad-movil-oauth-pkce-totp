import { Router } from 'express';
import QRCode from 'qrcode';

import type { AppContext } from '../context.js';
import { bodyString } from '../http.js';
import { log } from '../lib/logger.js';
import { normalizeBase32 } from '../lib/base32.js';
import { enrollPage } from '../views/pages.js';

export function buildOtpauthUri(email: string, secret: string): string {
  // ":" y "@" son válidos en el path de una URI (RFC 3986), igual que en el ejemplo de la guía.
  const account = encodeURIComponent(email).replace('%40', '@');
  return `otpauth://totp/UniSabana:${account}?secret=${normalizeBase32(secret)}&issuer=UniSabana`;
}

export function devRouter(ctx: AppContext): Router {
  const router = Router();

  // j) Salud.
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date(ctx.clock()).toISOString() });
  });

  // i) Página de enrolamiento con QR. SOLO DESARROLLO (DEV_ENROLL_PAGE=true).
  if (ctx.config.devEnrollPage) {
    router.get('/mfa/enroll', async (_req, res) => {
      const uri = buildOtpauthUri(ctx.config.demoUser.email, ctx.config.totpSecret);
      const qr = await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 480 });
      log('ENROLL', 'página de enrolamiento servida (solo desarrollo)');
      res
        .set('Cache-Control', 'no-store')
        .type('html')
        .send(enrollPage(qr, normalizeBase32(ctx.config.totpSecret), uri));
    });

    // Diagnóstico de la app en desarrollo: imprime en esta consola lo que la app reporta (ya enmascarado),
    // para ver qué pasa cuando Expo Go reinicia la app al volver del navegador.
    router.post('/dev/diag', (req, res) => {
      const instance = bodyString(req, 'instance')
        .replace(/[^a-z0-9]/gi, '')
        .slice(0, 8);
      const message = bodyString(req, 'message')
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 300);
      if (message) log('APP', `[${instance || '?'}] ${message}`);
      res.status(204).end();
    });
  }

  return router;
}
