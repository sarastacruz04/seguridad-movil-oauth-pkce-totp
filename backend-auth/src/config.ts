import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { decodeBase32 } from './lib/base32.js';

export const CLIENT_ID = 'unisabana-mobile';
export const DEMO_EMAIL = 'estudiante@unisabana.edu.co';

/** Prefijos de redirect_uri permitidos: esquema propio y, solo para Expo Go en desarrollo, exp:// y exps://. */
export const ALLOWED_REDIRECT_PREFIXES = ['unisabana-auth://', 'exp://', 'exps://'] as const;

export interface DemoUser {
  readonly id: string;
  readonly email: string;
  readonly password: string;
}

export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly clientId: string;
  readonly demoUser: DemoUser;
  readonly totpSecret: string;
  readonly jwtSecret: string;
  readonly jwtSecretIsEphemeral: boolean;
  readonly accessTtlSeconds: number;
  readonly refreshTtlSeconds: number;
  readonly stepUpTtlSeconds: number;
  readonly elevatedTtlSeconds: number;
  readonly authCodeTtlSeconds: number;
  readonly replayTtlSeconds: number;
  readonly devEnrollPage: boolean;
  readonly maxFailedMfaPerMinute: number;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

function positiveInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigError(`${key} debe ser un entero positivo (recibido: "${raw}")`);
  }
  return value;
}

function bool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.trim().toLowerCase() === 'true';
}

/** Construye la configuración a partir de un objeto de entorno (inyectable para los tests). */
export function buildConfig(env: NodeJS.ProcessEnv): AppConfig {
  const totpSecret = (env.TOTP_SECRET ?? 'JBSWY3DPEHPK3PXP').trim();
  decodeBase32(totpSecret); // valida la semilla al arrancar: falla rápido si está mal escrita

  const configuredJwtSecret = env.JWT_SECRET?.trim() ?? '';
  const jwtSecretIsEphemeral = configuredJwtSecret === '';

  return {
    port: positiveInt(env, 'PORT', 3000),
    host: env.HOST?.trim() || '0.0.0.0',
    clientId: CLIENT_ID,
    demoUser: {
      id: 'usr_estudiante_001',
      email: DEMO_EMAIL,
      password: env.DEMO_PASSWORD?.trim() || 'Sabana2026!',
    },
    totpSecret,
    jwtSecret: jwtSecretIsEphemeral ? randomBytes(32).toString('base64url') : configuredJwtSecret,
    jwtSecretIsEphemeral,
    accessTtlSeconds: positiveInt(env, 'ACCESS_TOKEN_TTL_SECONDS', 300),
    refreshTtlSeconds: positiveInt(env, 'REFRESH_TOKEN_TTL_DAYS', 30) * 24 * 60 * 60,
    stepUpTtlSeconds: positiveInt(env, 'STEP_UP_TTL_SECONDS', 300),
    elevatedTtlSeconds: positiveInt(env, 'ELEVATED_TTL_SECONDS', 600),
    authCodeTtlSeconds: positiveInt(env, 'AUTH_CODE_TTL_SECONDS', 60),
    replayTtlSeconds: positiveInt(env, 'REPLAY_TTL_SECONDS', 90),
    devEnrollPage: bool(env, 'DEV_ENROLL_PAGE', true),
    maxFailedMfaPerMinute: 5,
  };
}

/** Carga backend-auth/.env (si existe) con el soporte nativo de Node, sin dotenv. */
export function loadDotEnv(): void {
  const path = resolve(import.meta.dirname, '..', '.env');
  if (existsSync(path)) process.loadEnvFile(path);
}
