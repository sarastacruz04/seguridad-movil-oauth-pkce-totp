import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';

import { base64UrlEncode } from '../src/lib/crypto/base64url';
import { asciiToBytes, bytesToHex, NonAsciiError, utf8ToBytes } from '../src/lib/crypto/bytes';
import { hmac } from '../src/lib/crypto/hmac';
import { CODE_VERIFIER_REGEX, computeCodeChallenge, createPkcePair, generateState } from '../src/lib/pkce/pkceCore';
import { runAllSelfTests } from '../src/lib/selftest/selfTests';
import { decodeBase32, InvalidBase32Error, validateBase32Secret } from '../src/lib/totp/base32';
import { InvalidOtpauthUriError, parseOtpauthUri } from '../src/lib/totp/otpauth';
import { counterToBytes, createTotpEngine, getSecondsRemaining, getTimeStep } from '../src/lib/totp/totpCore';
import { nodeCryptoProvider } from './nodeCrypto';

describe('Self-tests RFC (los mismos que corre el teléfono)', () => {
  it('RFC 2202, 4226, 6238 y 7636 pasan con el núcleo propio', async () => {
    const suites = await runAllSelfTests(nodeCryptoProvider);
    for (const suite of suites) {
      for (const testCase of suite.cases) {
        assert.equal(testCase.actual, testCase.expected, `${suite.title} — ${testCase.name}`);
      }
    }
    assert.equal(suites.length, 4);
  });
});

describe('Base64URL sin relleno (manual)', () => {
  it('coincide con Buffer.toString("base64url") para longitudes 0..64', () => {
    for (let length = 0; length <= 64; length += 1) {
      const bytes = new Uint8Array(randomBytes(length));
      assert.equal(base64UrlEncode(bytes), Buffer.from(bytes).toString('base64url'));
    }
  });
});

describe('Bytes', () => {
  it('UTF-8 manual = TextEncoder; ASCII rechaza no-ASCII', () => {
    for (const text of ['Hi There', 'ñandú', '🔐 2FA', '']) {
      assert.deepEqual(utf8ToBytes(text), new TextEncoder().encode(text));
    }
    assert.throws(() => asciiToBytes('añ'), NonAsciiError);
  });
});

describe('HMAC manual', () => {
  it('= node:crypto createHmac para claves cortas, de 64 bytes y largas (SHA-1 y SHA-256)', async () => {
    for (const keyLength of [1, 20, 64, 65, 200]) {
      const key = new Uint8Array(randomBytes(keyLength));
      const message = new Uint8Array(randomBytes(37));
      assert.equal(bytesToHex(await hmac(nodeCryptoProvider.sha1, key, message)), createHmac('sha1', key).update(message).digest('hex'));
      assert.equal(
        bytesToHex(await hmac(nodeCryptoProvider.sha256, key, message)),
        createHmac('sha256', key).update(message).digest('hex'),
      );
    }
  });
});

describe('TOTP', () => {
  const engine = createTotpEngine(nodeCryptoProvider.sha1);

  it('contador de 8 bytes big-endian, también por encima de 2^32', () => {
    assert.deepEqual([...counterToBytes(1)], [0, 0, 0, 0, 0, 0, 0, 1]);
    assert.deepEqual([...counterToBytes(0x1_0000_0002)], [0, 0, 0, 1, 0, 0, 0, 2]);
  });

  it('getTimeStep y getSecondsRemaining', () => {
    assert.equal(getTimeStep(59), 1);
    assert.equal(getTimeStep(60), 2);
    assert.equal(getSecondsRemaining(60), 30);
    assert.equal(getSecondsRemaining(89), 1);
  });

  it('generateTotp con la semilla Base32 del laboratorio produce siempre 6 dígitos', async () => {
    for (let t = 1_700_000_000; t < 1_700_000_000 + 30 * 50; t += 30) {
      assert.match(await engine.generateTotp('JBSWY3DPEHPK3PXP', t), /^\d{6}$/);
    }
  });

  it('coincide con el TOTP del backend (implementación independiente con node:crypto)', async () => {
    const { totp } = await import('../../backend-auth/src/lib/totp');
    const { decodeBase32: decodeServer } = await import('../../backend-auth/src/lib/base32');
    const key = decodeServer('JBSWY3DPEHPK3PXP');
    for (let t = 1_750_000_000; t < 1_750_000_000 + 30 * 20; t += 30) {
      assert.equal(await engine.generateTotp('JBSWY3DPEHPK3PXP', t), totp(key, t));
    }
  });
});

describe('Base32', () => {
  it('decodifica JBSWY3DPEHPK3PXP → "Hello!" + DEADBEEF', () => {
    assert.equal(bytesToHex(decodeBase32('JBSWY3DPEHPK3PXP')), '48656c6c6f21deadbeef');
  });
  it('valida con mensajes específicos', () => {
    assert.equal(validateBase32Secret('jbsw y3dp ehpk 3pxp'), null);
    assert.match(validateBase32Secret('JBSWY3DPEHPK3PX1') ?? '', /Carácter inválido "1"/);
    assert.match(validateBase32Secret('JBSWY3DP') ?? '', /Muy corta/);
    assert.throws(() => decodeBase32('0000000000000000'), InvalidBase32Error);
  });
});

describe('Parser otpauth://', () => {
  it('lee el ejemplo de la guía', () => {
    assert.deepEqual(parseOtpauthUri('otpauth://totp/UniSabana:estudiante@unisabana.edu.co?secret=JBSWY3DPEHPK3PXP&issuer=UniSabana'), {
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'UniSabana',
      accountName: 'estudiante@unisabana.edu.co',
    });
  });
  it('decodifica percent-encoding y toma el issuer del prefijo si falta el parámetro', () => {
    assert.deepEqual(parseOtpauthUri('otpauth://totp/Uni%20Sabana%3Aana%40x.co?secret=jbswy3dpehpk3pxp'), {
      secret: 'JBSWY3DPEHPK3PXP',
      issuer: 'Uni Sabana',
      accountName: 'ana@x.co',
    });
  });
  it('rechaza HOTP, SHA256, 8 dígitos, periodo 60 y semilla inválida', () => {
    const base = 'otpauth://totp/A:b?secret=JBSWY3DPEHPK3PXP';
    assert.throws(() => parseOtpauthUri('otpauth://hotp/A:b?secret=JBSWY3DPEHPK3PXP&counter=1'), InvalidOtpauthUriError);
    assert.throws(() => parseOtpauthUri(`${base}&algorithm=SHA256`), /solo SHA1/);
    assert.throws(() => parseOtpauthUri(`${base}&digits=8`), /solo se soportan 6/);
    assert.throws(() => parseOtpauthUri(`${base}&period=60`), /solo 30 s/);
    assert.throws(() => parseOtpauthUri('otpauth://totp/A:b?secret=123'), /Semilla inválida/);
    assert.throws(() => parseOtpauthUri('https://example.com'), /otpauth/);
  });
});

describe('PKCE', () => {
  it('verifier de 64 chars válido, challenge = BASE64URL(SHA256(verifier)) de 43 chars', async () => {
    const { codeVerifier, codeChallenge } = await createPkcePair(nodeCryptoProvider.randomBytes, nodeCryptoProvider.sha256);
    assert.equal(codeVerifier.length, 64);
    assert.match(codeVerifier, CODE_VERIFIER_REGEX);
    assert.equal(codeChallenge.length, 43);
    assert.equal(codeChallenge, createHash('sha256').update(codeVerifier).digest('base64url'));
  });
  it('state aleatorio de 22 chars y distinto cada vez', async () => {
    const a = await generateState(nodeCryptoProvider.randomBytes);
    const b = await generateState(nodeCryptoProvider.randomBytes);
    assert.equal(a.length, 22);
    assert.notEqual(a, b);
  });
  it('rechaza verifiers fuera de especificación', async () => {
    await assert.rejects(computeCodeChallenge(nodeCryptoProvider.sha256, 'corto'));
  });
});
