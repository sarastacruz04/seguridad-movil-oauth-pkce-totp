/**
 * Vectores oficiales de los RFC, ejecutables tanto en Node (tests) como en el teléfono
 * (pantalla Laboratorio, con expo-crypto). Si pasan en el dispositivo, el código mostrado
 * por la app coincide con Google Authenticator.
 */
import { bytesToHex, utf8ToBytes } from '../crypto/bytes';
import { hmac } from '../crypto/hmac';
import type { CryptoProvider } from '../crypto/types';
import { computeCodeChallenge } from '../pkce/pkceCore';
import { createTotpEngine } from '../totp/totpCore';

export interface SelfTestCase {
  readonly name: string;
  readonly expected: string;
  readonly actual: string;
  readonly passed: boolean;
}

export interface SelfTestSuite {
  readonly id: 'rfc2202' | 'rfc4226' | 'rfc6238' | 'rfc7636';
  readonly title: string;
  readonly cases: readonly SelfTestCase[];
  readonly passed: boolean;
}

const RFC_SECRET = '12345678901234567890';

function suite(id: SelfTestSuite['id'], title: string, cases: SelfTestCase[]): SelfTestSuite {
  return { id, title, cases, passed: cases.every((c) => c.passed) };
}

function check(name: string, expected: string, actual: string): SelfTestCase {
  return { name, expected, actual, passed: expected === actual };
}

export async function runHmacSelfTest(crypto: CryptoProvider): Promise<SelfTestSuite> {
  const key = new Uint8Array(20).fill(0x0b);
  const actual = bytesToHex(await hmac(crypto.sha1, key, utf8ToBytes('Hi There')));
  const longKey = new Uint8Array(80).fill(0xaa); // caso 6: clave > 64 bytes (se hashea primero)
  const actualLong = bytesToHex(
    await hmac(crypto.sha1, longKey, utf8ToBytes('Test Using Larger Than Block-Size Key - Hash Key First')),
  );
  return suite('rfc2202', 'RFC 2202 · HMAC-SHA1', [
    check('Caso 1: clave 0x0b×20, "Hi There"', 'b617318655057264e28bc0b6fb378c8ef146be00', actual),
    check('Caso 6: clave 0xaa×80 (> bloque)', 'aa4ae5e15272d00e95705637ce8a3b55ed402112', actualLong),
  ]);
}

export async function runHotpSelfTest(crypto: CryptoProvider): Promise<SelfTestSuite> {
  const engine = createTotpEngine(crypto.sha1);
  const key = utf8ToBytes(RFC_SECRET);
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  const cases = await Promise.all(
    expected.map(async (code, counter) => check(`contador ${counter}`, code, await engine.hotp(key, counter))),
  );
  return suite('rfc4226', 'RFC 4226 · HOTP', cases);
}

export async function runTotpSelfTest(crypto: CryptoProvider): Promise<SelfTestSuite> {
  const engine = createTotpEngine(crypto.sha1);
  const key = utf8ToBytes(RFC_SECRET);
  const vectors: ReadonlyArray<readonly [number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130'],
  ];
  const cases = await Promise.all(
    vectors.map(async ([t, code]) => check(`t = ${t}`, code, await engine.generateTotpFromKey(key, t))),
  );
  return suite('rfc6238', 'RFC 6238 · TOTP SHA-1', cases);
}

export async function runPkceSelfTest(crypto: CryptoProvider): Promise<SelfTestSuite> {
  const actual = await computeCodeChallenge(crypto.sha256, 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
  return suite('rfc7636', 'RFC 7636 · PKCE S256', [
    check('Apéndice B: challenge del verifier de ejemplo', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', actual),
  ]);
}

export function runAllSelfTests(crypto: CryptoProvider): Promise<SelfTestSuite[]> {
  return Promise.all([runHmacSelfTest(crypto), runHotpSelfTest(crypto), runTotpSelfTest(crypto), runPkceSelfTest(crypto)]);
}
