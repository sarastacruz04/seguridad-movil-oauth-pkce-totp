import type { Request, Response } from 'express';

import { type AppContext, nowSeconds } from './context.js';
import { type JwtClaims, type TokenType, verifyJwt } from './lib/jwt.js';

/** Todas las respuestas de error tienen la forma { error, message }. */
export function sendError(res: Response, status: number, error: string, message: string): void {
  res.status(status).json({ error, message });
}

/** Las respuestas con tokens nunca deben quedar en cachés intermedias (RFC 6749 §5.1). */
export function noStore(res: Response): Response {
  return res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
}

export function bodyString(req: Request, field: string): string {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null) return '';
  const value: unknown = (body as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : '';
}

export type BearerResult =
  | { readonly ok: true; readonly claims: JwtClaims }
  | { readonly ok: false; readonly error: 'invalid_token' | 'token_expired'; readonly message: string };

export function readBearer(req: Request, ctx: AppContext): BearerResult {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_\-.]+)$/.exec(header);
  if (!match?.[1]) return { ok: false, error: 'invalid_token', message: 'Falta el header Authorization: Bearer <token>.' };

  const result = verifyJwt(match[1], ctx.config.jwtSecret, nowSeconds(ctx));
  if (result.ok) return { ok: true, claims: result.claims };
  if (result.reason === 'expired') return { ok: false, error: 'token_expired', message: 'El token expiró.' };
  return { ok: false, error: 'invalid_token', message: 'Token inválido.' };
}

/**
 * Autentica la petición y exige uno de los tipos de token permitidos. Responde 401 si no cumple
 * (con WWW-Authenticate, RFC 6750) y devuelve undefined. Un step_up_token nunca pasa este filtro.
 */
export function authenticate(
  req: Request,
  res: Response,
  ctx: AppContext,
  allowed: readonly TokenType[],
): JwtClaims | undefined {
  const result = readBearer(req, ctx);
  if (!result.ok) {
    res.set('WWW-Authenticate', `Bearer error="invalid_token"`);
    sendError(res, 401, result.error, result.message);
    return undefined;
  }
  if (!allowed.includes(result.claims.typ)) {
    res.set('WWW-Authenticate', `Bearer error="invalid_token"`);
    sendError(res, 401, 'invalid_token', `Un token de tipo "${result.claims.typ}" no da acceso a este recurso.`);
    return undefined;
  }
  return result.claims;
}
