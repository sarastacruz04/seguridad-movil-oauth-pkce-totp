import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildAuthorizeUrl, isStateValid, parseCallbackUrl } from '../src/lib/oauth/authorizeRequest';

describe('URL de autorización', () => {
  it('incluye todos los parámetros codificados y method S256, sin client_secret', () => {
    const url = buildAuthorizeUrl({
      apiUrl: 'http://192.168.1.50:3000',
      clientId: 'unisabana-mobile',
      redirectUri: 'exp://192.168.1.50:8081/--/callback',
      codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      state: 'abc_DEF-123',
    });
    assert.equal(
      url,
      'http://192.168.1.50:3000/oauth/authorize?response_type=code&client_id=unisabana-mobile' +
        '&redirect_uri=exp%3A%2F%2F192.168.1.50%3A8081%2F--%2Fcallback' +
        '&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&state=abc_DEF-123',
    );
    assert.doesNotMatch(url, /secret/);
  });
});

describe('Deep link de retorno', () => {
  it('extrae code y state de unisabana-auth:// y de exp:// con query previa', () => {
    assert.deepEqual(parseCallbackUrl('unisabana-auth://callback?code=abc&state=xyz'), {
      code: 'abc',
      state: 'xyz',
      error: null,
      errorDescription: null,
    });
    assert.deepEqual(parseCallbackUrl('exp://10.0.0.2:8081/--/callback?x=1&code=c%2Bd&state=s#frag'), {
      code: 'c+d',
      state: 's',
      error: null,
      errorDescription: null,
    });
  });
  it('lee el error del proveedor', () => {
    const parsed = parseCallbackUrl('unisabana-auth://callback?error=invalid_request&error_description=state%20es%20obligatorio&state=s');
    assert.equal(parsed.error, 'invalid_request');
    assert.equal(parsed.errorDescription, 'state es obligatorio');
  });
  it('un parámetro repetido no puede pisar al primero', () => {
    assert.equal(parseCallbackUrl('app://cb?state=bueno&state=malo').state, 'bueno');
  });
});

describe('Validación anti-CSRF del state', () => {
  it('solo acepta el state exacto del intento en curso', () => {
    assert.equal(isStateValid('Q3vX9k2mLp0aZr8tYw1n4A', 'Q3vX9k2mLp0aZr8tYw1n4A'), true);
    assert.equal(isStateValid('Q3vX9k2mLp0aZr8tYw1n4A', 'Q3vX9k2mLp0aZr8tYw1n4B'), false);
    assert.equal(isStateValid('Q3vX9k2mLp0aZr8tYw1n4A', null), false);
    assert.equal(isStateValid(null, 'Q3vX9k2mLp0aZr8tYw1n4A'), false);
    assert.equal(isStateValid('abc', 'abcd'), false);
  });
});
