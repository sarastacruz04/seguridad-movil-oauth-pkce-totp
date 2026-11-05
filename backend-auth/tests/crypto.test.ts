import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InvalidBase32Error, decodeBase32 } from '../src/lib/base32.js';
import { signJwt, verifyJwt } from '../src/lib/jwt.js';
import { computeS256Challenge, verifyPkce } from '../src/lib/pkce.js';
import { counterToBytes, dynamicTruncate, hotp, totp, verifyTotp } from '../src/lib/totp.js';

const RFC_SECRET = new TextEncoder().encode('12345678901234567890');

describe('RFC 4226 — HOTP (apéndice D)', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  expected.forEach((code, counter) => {
    it(`contador ${counter} → ${code}`, () => assert.equal(hotp(RFC_SECRET, counter), code));
  });

  it('truncamiento dinámico del ejemplo de la sección 5.4', () => {
    const hmac = Uint8Array.from(Buffer.from('1f8698690e02ca16618550ef7f19da8e945b555a', 'hex'));
    // offset = 0x5a & 0xf = 10 → 0x50ef7f19 = 1357872921 → 872921
    assert.equal(dynamicTruncate(hmac), '872921');
  });
});

describe('RFC 6238 — TOTP SHA-1 (apéndice B, últimos 6 dígitos)', () => {
  const vectors: ReadonlyArray<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ];
  for (const [t, code] of vectors) {
    it(`t=${t} → ${code}`, () => assert.equal(totp(RFC_SECRET, t), code));
  }

  it('el contador es un entero de 64 bits big-endian (8 bytes)', () => {
    assert.deepEqual([...counterToBytes(1)], [0, 0, 0, 0, 0, 0, 0, 1]);
    assert.deepEqual([...counterToBytes(2 ** 32 + 5)], [0, 0, 0, 1, 0, 0, 0, 5]);
  });
});

describe('Ventanas de tolerancia C-1 / C / C+1', () => {
  const t = 1_700_000_015; // centro de una ventana
  it('acepta el código de la ventana anterior, actual y siguiente', () => {
    assert.deepEqual(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t - 30), t), { valid: true, matchedStep: Math.floor(t / 30) - 1, drift: -1 });
    assert.equal(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t), t).valid, true);
    assert.equal(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t + 30), t).valid, true);
  });
  it('rechaza C-2 y C+2', () => {
    assert.equal(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t - 60), t).valid, false);
    assert.equal(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t + 60), t).valid, false);
  });
});

describe('Base32 (RFC 4648)', () => {
  it('decodifica la semilla del laboratorio', () => {
    assert.equal(Buffer.from(decodeBase32('JBSWY3DPEHPK3PXP')).toString('hex'), '48656c6c6f21deadbeef');
  });
  it('normaliza espacios, guiones, minúsculas y relleno', () => {
    assert.deepEqual(decodeBase32('jbsw y3dp-ehpk 3pxp=='), decodeBase32('JBSWY3DPEHPK3PXP'));
  });
  it('rechaza caracteres fuera del alfabeto y semillas cortas', () => {
    assert.throws(() => decodeBase32('JBSWY3DPEHPK3PX1'), InvalidBase32Error);
    assert.throws(() => decodeBase32('JBSWY3DP'), InvalidBase32Error);
  });
});

describe('RFC 7636 — PKCE S256 (apéndice B)', () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
  it('BASE64URL(SHA256(verifier)) coincide con el vector', () => assert.equal(computeS256Challenge(verifier), challenge));
  it('verifyPkce acepta el verifier correcto y rechaza otro', () => {
    assert.equal(verifyPkce(verifier, challenge), true);
    assert.equal(verifyPkce(`${verifier.slice(0, -1)}A`, challenge), false);
    assert.equal(verifyPkce('corto', challenge), false);
  });
});

describe('JWT HS256 hecho a mano', () => {
  const secret = 'test-secret';
  const token = signJwt({ sub: 'u1', typ: 'access', mfaVerified: false, ttlSeconds: 60, nowSeconds: 1000 }, secret);

  it('verifica firma y claims', () => {
    const result = verifyJwt(token, secret, 1001);
    assert.ok(result.ok);
    assert.equal(result.claims.typ, 'access');
    assert.equal(result.claims.mfa_verified, false);
  });
  it('rechaza expirado, firma alterada, otra clave y alg "none"', () => {
    assert.deepEqual(verifyJwt(token, secret, 1060), { ok: false, reason: 'expired' });
    const [h, p] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: 'u1', iat: 1000, exp: 9999, typ: 'elevated', mfa_verified: true, jti: 'x' }),
    ).toString('base64url');
    assert.deepEqual(verifyJwt(`${h}.${forgedPayload}.${token.split('.')[2]}`, secret, 1001), { ok: false, reason: 'bad_signature' });
    assert.deepEqual(verifyJwt(token, 'otra-clave', 1001), { ok: false, reason: 'bad_signature' });
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    assert.deepEqual(verifyJwt(`${none}.${p}.`, secret, 1001), { ok: false, reason: 'malformed' });
  });
});
