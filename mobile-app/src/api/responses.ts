/** Validación en tiempo de ejecución de las respuestas del backend (no se confía ciegamente en el JSON). */
import { ApiError } from './errors';

function record(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null)
    throw new ApiError(0, 'invalid_response', 'Respuesta del servidor con formato inesperado.');
  return data as Record<string, unknown>;
}

function requireString(data: Record<string, unknown>, field: string): string {
  const value = data[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError(0, 'invalid_response', `La respuesta no trae "${field}".`);
  }
  return value;
}

function requireNumber(data: Record<string, unknown>, field: string): number {
  const value = data[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ApiError(0, 'invalid_response', `La respuesta no trae "${field}".`);
  }
  return value;
}

export interface TokenResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
}

export function parseTokenResponse(data: unknown): TokenResponse {
  const body = record(data);
  return {
    accessToken: requireString(body, 'access_token'),
    expiresIn: requireNumber(body, 'expires_in'),
    refreshToken: requireString(body, 'refresh_token'),
  };
}

export function parseRefreshResponse(data: unknown): { accessToken: string; expiresIn: number } {
  const body = record(data);
  return { accessToken: requireString(body, 'access_token'), expiresIn: requireNumber(body, 'expires_in') };
}

export function parseElevatedResponse(data: unknown): { elevatedToken: string; expiresIn: number } {
  const body = record(data);
  return { elevatedToken: requireString(body, 'elevated_token'), expiresIn: requireNumber(body, 'expires_in') };
}

export interface Profile {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly mfaVerified: boolean;
  readonly tokenExpiresAt: number;
}

export function parseProfile(data: unknown): Profile {
  const body = record(data);
  return {
    id: requireString(body, 'id'),
    email: requireString(body, 'email'),
    name: requireString(body, 'name'),
    mfaVerified: body.mfa_verified === true,
    tokenExpiresAt: requireNumber(body, 'token_expires_at'),
  };
}

export interface VaultItem {
  readonly label: string;
  readonly value: string;
}

export interface Vault {
  readonly owner: string;
  readonly elevatedUntil: number;
  readonly items: readonly VaultItem[];
}

export function parseVault(data: unknown): Vault {
  const body = record(data);
  const items = Array.isArray(body.items) ? body.items : [];
  return {
    owner: requireString(body, 'owner'),
    elevatedUntil: requireNumber(body, 'elevated_until'),
    items: items.map((item) => {
      const entry = record(item);
      return { label: requireString(entry, 'label'), value: requireString(entry, 'value') };
    }),
  };
}
