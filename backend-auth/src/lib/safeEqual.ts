import { timingSafeEqual } from 'node:crypto';

/**
 * Comparación de cadenas en tiempo constante. Si las longitudes difieren se devuelve false
 * (la longitud de códigos/challenges no es secreta: es fija por especificación).
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
