import { Router } from 'express';

import { type AppContext, nowSeconds } from '../context.js';
import { bodyString, noStore, sendError } from '../http.js';
import { signJwt } from '../lib/jwt.js';
import { log, mask } from '../lib/logger.js';
import { CODE_VERIFIER_REGEX, verifyPkce } from '../lib/pkce.js';
import { safeEqual } from '../lib/safeEqual.js';
import { appendQuery, validateAuthorizeParams } from '../oauth/authorizeParams.js';
import { errorPage, loginPage, redirectPage } from '../views/pages.js';

export function oauthRouter(ctx: AppContext): Router {
  const router = Router();
  const { config } = ctx;

  // a) Pantalla de login (abierta por la app en el navegador del sistema).
  router.get('/oauth/authorize', (req, res) => {
    const validation = validateAuthorizeParams(req.query, config.clientId);
    if (!validation.ok) {
      if (validation.kind === 'fatal') {
        log('OAUTH', `authorize rechazado: ${validation.message}`);
        res.status(400).type('html').send(errorPage('Solicitud inválida', validation.message));
        return;
      }
      log('OAUTH', `authorize con error ${validation.error}: ${validation.description}`);
      res.redirect(
        302,
        appendQuery(validation.redirectUri, {
          error: validation.error,
          error_description: validation.description,
          state: validation.state,
        }),
      );
      return;
    }
    log('OAUTH', `formulario de login (redirect_uri=${validation.params.redirectUri})`);
    res.type('html').send(loginPage(validation.params, { email: config.demoUser.email }));
  });

  // b) Envío de credenciales. Los campos ocultos se vuelven a validar: nunca se confía en el formulario.
  router.post('/oauth/authorize', (req, res) => {
    const body: Record<string, unknown> = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const validation = validateAuthorizeParams(body, config.clientId);
    if (!validation.ok) {
      const message = validation.kind === 'fatal' ? validation.message : validation.description;
      res.status(400).type('html').send(errorPage('Solicitud inválida', message));
      return;
    }
    const { params } = validation;
    const email = bodyString(req, 'email').trim().toLowerCase();
    const password = bodyString(req, 'password');

    const validUser = email === config.demoUser.email && safeEqual(password, config.demoUser.password);
    if (!validUser) {
      log('OAUTH', `credenciales incorrectas para "${email}"`);
      res
        .status(401)
        .type('html')
        .send(loginPage(params, { email, error: 'Correo o contraseña incorrectos.' }));
      return;
    }

    const code = ctx.authCodes.issue({
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      clientId: params.clientId,
      userId: config.demoUser.id,
      expiresAtMs: ctx.clock() + config.authCodeTtlSeconds * 1000,
    });
    const location = appendQuery(params.redirectUri, { code, state: params.state });
    log('OAUTH', `login OK → code ${mask(code)} (TTL ${config.authCodeTtlSeconds}s), redirigiendo a la app`);
    // 302 + página de respaldo con enlace, por si el navegador no sigue el salto a un esquema no-http.
    res.status(302).set('Location', location).type('html').send(redirectPage(location));
  });

  // c) Canje del authorization_code + code_verifier por tokens.
  router.post('/auth/oauth/token', (req, res) => {
    noStore(res);
    const grantType = bodyString(req, 'grant_type');
    const code = bodyString(req, 'code');
    const codeVerifier = bodyString(req, 'code_verifier');
    const clientId = bodyString(req, 'client_id');
    const redirectUri = bodyString(req, 'redirect_uri');

    if (grantType !== 'authorization_code') {
      sendError(res, 400, 'unsupported_grant_type', 'grant_type debe ser authorization_code.');
      return;
    }
    if (clientId !== config.clientId) {
      sendError(res, 401, 'invalid_client', 'client_id desconocido.');
      return;
    }
    // Se consume (borra) el code ANTES de cualquier otra validación: un solo intento por code.
    const record = code ? ctx.authCodes.consume(code) : undefined;
    if (!record) {
      log('PKCE', 'code desconocido o ya usado');
      sendError(res, 400, 'invalid_grant', 'authorization_code inválido o ya utilizado.');
      return;
    }
    if (record.expiresAtMs <= ctx.clock()) {
      log('PKCE', 'code expirado');
      sendError(res, 400, 'invalid_grant', 'authorization_code expirado.');
      return;
    }
    if (record.clientId !== clientId || record.redirectUri !== redirectUri) {
      log('PKCE', 'redirect_uri/client_id no coinciden con los del authorize');
      sendError(res, 400, 'invalid_grant', 'redirect_uri no coincide con el usado en /oauth/authorize.');
      return;
    }
    if (!CODE_VERIFIER_REGEX.test(codeVerifier)) {
      log('PKCE', 'code_verifier con formato inválido');
      sendError(res, 400, 'invalid_request', 'code_verifier debe tener 43–128 caracteres [A-Za-z0-9-._~].');
      return;
    }
    if (!verifyPkce(codeVerifier, record.codeChallenge)) {
      log('PKCE', 'FALLO: BASE64URL(SHA256(code_verifier)) ≠ code_challenge');
      sendError(res, 400, 'invalid_grant', 'PKCE inválido: el code_verifier no corresponde al code_challenge.');
      return;
    }
    log('PKCE', 'ok: SHA256(code_verifier) coincide con code_challenge');

    const now = nowSeconds(ctx);
    const accessToken = signJwt(
      { sub: record.userId, typ: 'access', mfaVerified: false, ttlSeconds: config.accessTtlSeconds, nowSeconds: now },
      config.jwtSecret,
    );
    const refreshToken = ctx.refreshTokens.issue(record.userId, config.refreshTtlSeconds, ctx.clock());
    log('TOKEN', `emitidos access ${mask(accessToken)} (${config.accessTtlSeconds}s) y refresh ${mask(refreshToken)}`);
    res.json({
      token_type: 'Bearer',
      access_token: accessToken,
      expires_in: config.accessTtlSeconds,
      refresh_token: refreshToken,
      refresh_expires_in: config.refreshTtlSeconds,
    });
  });

  return router;
}
