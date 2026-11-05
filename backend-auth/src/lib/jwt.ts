/**
 * JWT HS256 escrito a mano con node:crypto: base64url(header).base64url(payload).base64url(HMAC-SHA256).
 * Se fija el algoritmo (solo HS256) para impedir ataques "alg: none" o de confusión de algoritmo.
 */
import { createHmac, randomBytes } from 'node:crypto';

import { safeEqual } from './safeEqual.js';

export type TokenType = 'access' | 'step_up' | 'elevated';

export interface JwtClaims {
  readonly sub: string;
  readonly iat: number;
  readonly exp: number;
  readonly typ: TokenType;
  readonly mfa_verified: boolean;
  readonly jti: string;
}

export type JwtFailureReason = 'malformed' | 'bad_signature' | 'expired';

export type JwtVerification =
  | { readonly ok: true; readonly claims: JwtClaims }
  | { readonly ok: false; readonly reason: JwtFailureReason };

const HEADER = { alg: 'HS256', typ: 'JWT' } as const;
const ENCODED_HEADER = Buffer.from(JSON.stringify(HEADER)).toString('base64url');
const TOKEN_TYPES: readonly TokenType[] = ['access', 'step_up', 'elevated'];

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export interface IssueOptions {
  readonly sub: string;
  readonly typ: TokenType;
  readonly mfaVerified: boolean;
  readonly ttlSeconds: number;
  readonly nowSeconds: number;
}

export function signJwt(options: IssueOptions, secret: string): string {
  const claims: JwtClaims = {
    sub: options.sub,
    iat: options.nowSeconds,
    exp: options.nowSeconds + options.ttlSeconds,
    typ: options.typ,
    mfa_verified: options.mfaVerified,
    jti: randomBytes(12).toString('base64url'),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = `${ENCODED_HEADER}.${payload}`;
  return `${signingInput}.${sign(signingInput, secret)}`;
}

function parseJson(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isClaims(value: unknown): value is JwtClaims {
  return (
    isRecord(value) &&
    typeof value.sub === 'string' &&
    typeof value.iat === 'number' &&
    typeof value.exp === 'number' &&
    typeof value.jti === 'string' &&
    typeof value.mfa_verified === 'boolean' &&
    typeof value.typ === 'string' &&
    (TOKEN_TYPES as readonly string[]).includes(value.typ)
  );
}

export function verifyJwt(token: string, secret: string, nowSeconds: number): JwtVerification {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [encodedHeader, encodedPayload, signature] = parts as [string, string, string];

  const header = parseJson(encodedHeader);
  if (!isRecord(header) || header.alg !== 'HS256' || header.typ !== 'JWT') {
    return { ok: false, reason: 'malformed' };
  }
  // La firma se verifica ANTES de confiar en cualquier claim.
  if (!safeEqual(sign(`${encodedHeader}.${encodedPayload}`, secret), signature)) {
    return { ok: false, reason: 'bad_signature' };
  }
  const claims = parseJson(encodedPayload);
  if (!isClaims(claims)) return { ok: false, reason: 'malformed' };
  if (claims.exp <= nowSeconds) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}
