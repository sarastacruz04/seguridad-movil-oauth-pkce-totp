import express, { type NextFunction, type Request, type Response } from 'express';

import type { AppContext } from './context.js';
import { sendError } from './http.js';
import { apiRouter } from './routes/api.js';
import { devRouter } from './routes/dev.js';
import { oauthRouter } from './routes/oauth.js';
import { sessionRouter } from './routes/session.js';

function hasStatus(error: unknown): error is { status: number; type?: string } {
  return typeof error === 'object' && error !== null && typeof (error as { status?: unknown }).status === 'number';
}

export function createApp(ctx: AppContext): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // Cabeceras defensivas: la página de login no puede embeberse en un iframe (anti-clickjacking)
  // y no se filtra la URL (con code/state) por Referer.
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'",
    });
    next();
  });

  app.use(express.json({ limit: '16kb' }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));

  app.use(oauthRouter(ctx));
  app.use(sessionRouter(ctx));
  app.use(apiRouter(ctx));
  app.use(devRouter(ctx));

  app.use((_req, res) => sendError(res, 404, 'not_found', 'Ruta no encontrada.'));

  // Cuatro parámetros obligatorios para que Express lo reconozca como manejador de errores.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (hasStatus(error) && error.status >= 400 && error.status < 500) {
      sendError(res, error.status, 'invalid_request', 'Cuerpo de la petición inválido.');
      return;
    }
    console.error(error);
    sendError(res, 500, 'server_error', 'Error interno del servidor.');
  });

  return app;
}
