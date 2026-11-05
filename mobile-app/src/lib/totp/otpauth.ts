/**
 * Parser propio de URIs otpauth (formato de Google Authenticator):
 *   otpauth://totp/Issuer:cuenta?secret=BASE32&issuer=Issuer[&algorithm=SHA1&digits=6&period=30]
 * Se parsea a mano (sin URL/URLSearchParams, que en React Native no son completos).
 */
import { normalizeBase32, validateBase32Secret } from './base32';
import type { TotpAccount } from './types';

export class InvalidOtpauthUriError extends Error {
  override readonly name = 'InvalidOtpauthUriError';
}

const PREFIX = 'otpauth://totp/';

function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    throw new InvalidOtpauthUriError('El QR contiene caracteres mal codificados.');
  }
}

function parseQuery(query: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decodeComponent(eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
    const value = eq === -1 ? '' : decodeComponent(pair.slice(eq + 1));
    if (!params.has(key)) params.set(key, value);
  }
  return params;
}

export function parseOtpauthUri(raw: string): TotpAccount {
  const uri = raw.trim();
  if (!uri.toLowerCase().startsWith('otpauth://')) {
    throw new InvalidOtpauthUriError('Este QR no es de un autenticador (no empieza por otpauth://).');
  }
  if (!uri.toLowerCase().startsWith(PREFIX)) {
    throw new InvalidOtpauthUriError('Solo se admiten códigos basados en tiempo (otpauth://totp/).');
  }

  const rest = uri.slice(PREFIX.length);
  const questionMark = rest.indexOf('?');
  const label = decodeComponent(questionMark === -1 ? rest : rest.slice(0, questionMark));
  const params = parseQuery(questionMark === -1 ? '' : rest.slice(questionMark + 1));

  const secret = params.get('secret') ?? '';
  const secretError = validateBase32Secret(secret);
  if (secretError) throw new InvalidOtpauthUriError(`Semilla inválida: ${secretError}`);

  // El laboratorio solo soporta los valores por defecto de Google Authenticator.
  const algorithm = (params.get('algorithm') ?? 'SHA1').toUpperCase();
  if (algorithm !== 'SHA1') throw new InvalidOtpauthUriError(`Algoritmo ${algorithm} no soportado: solo SHA1.`);
  const digits = params.get('digits') ?? '6';
  if (digits !== '6') throw new InvalidOtpauthUriError(`Se piden ${digits} dígitos: solo se soportan 6.`);
  const period = params.get('period') ?? '30';
  if (period !== '30') throw new InvalidOtpauthUriError(`Periodo de ${period}s no soportado: solo 30 s.`);

  // Etiqueta "Issuer:cuenta" (el issuer del parámetro tiene prioridad sobre el prefijo).
  const colon = label.indexOf(':');
  const labelIssuer = colon === -1 ? '' : label.slice(0, colon).trim();
  const accountName = (colon === -1 ? label : label.slice(colon + 1)).trim();
  const issuer = (params.get('issuer') ?? labelIssuer).trim();

  return {
    secret: normalizeBase32(secret),
    issuer: issuer || 'Sin emisor',
    accountName: accountName || 'Cuenta sin nombre',
  };
}
