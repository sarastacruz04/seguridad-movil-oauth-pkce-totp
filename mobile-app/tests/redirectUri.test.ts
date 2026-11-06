import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type RedirectEnvironment, resolveRedirectUri } from '../src/lib/oauth/redirectUri';

const BUILD: RedirectEnvironment = {
  expoVersion: null,
  appOwnership: null,
  hasExpoGoConfig: false,
  hostUri: null,
  linkingUri: 'unisabana-auth://',
  createdUrl: 'unisabana-auth://callback',
};

describe('redirect_uri según el entorno', () => {
  it('build propio → esquema de app.json', () => {
    assert.equal(resolveRedirectUri(BUILD, 'callback'), 'unisabana-auth://callback');
  });

  it('Expo Go aunque Linking.createURL devuelva el esquema propio (caso observado en Android) → exp://host/--/callback', () => {
    const env: RedirectEnvironment = { ...BUILD, expoVersion: '58.0.0', hostUri: '10.0.3.247:8081', linkingUri: null };
    assert.equal(resolveRedirectUri(env, 'callback'), 'exp://10.0.3.247:8081/--/callback');
  });

  it('Expo Go con linkingUri disponible → se respeta (también exps:// de un túnel)', () => {
    assert.equal(
      resolveRedirectUri({ ...BUILD, linkingUri: 'exp://10.0.3.247:8081/--/', hostUri: null }, '/callback'),
      'exp://10.0.3.247:8081/--/callback',
    );
    assert.equal(
      resolveRedirectUri({ ...BUILD, appOwnership: 'expo', linkingUri: 'exps://abc.exp.direct/--/' }, 'callback'),
      'exps://abc.exp.direct/--/callback',
    );
  });

  it('Expo Go sin datos de host → cae en lo que dé Linking.createURL', () => {
    assert.equal(resolveRedirectUri({ ...BUILD, hasExpoGoConfig: true, linkingUri: null }, 'callback'), 'unisabana-auth://callback');
  });
});
