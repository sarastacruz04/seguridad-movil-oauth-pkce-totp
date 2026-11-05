import type { AuthorizeParams } from '../oauth/authorizeParams.js';
import { escapeHtml, layout } from './layout.js';

interface LoginPageOptions {
  readonly email?: string;
  readonly error?: string;
}

function hidden(name: string, value: string): string {
  return `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`;
}

/** Formulario de login del proveedor. Se muestra en el NAVEGADOR DEL SISTEMA, nunca dentro de la app. */
export function loginPage(params: AuthorizeParams, options: LoginPageOptions = {}): string {
  const error = options.error ? `<p class="alert" role="alert">${escapeHtml(options.error)}</p>` : '';
  return layout(
    'Iniciar sesión · UniSabana',
    `<span class="badge">Proveedor de identidad · UniSabana</span>
<h1>Iniciar sesión</h1>
<p class="muted">La app <strong>${escapeHtml(params.clientId)}</strong> solicita acceso a tu cuenta.
Tus credenciales se escriben aquí, en el navegador del sistema; la app nunca las ve.</p>
${error}
<form method="post" action="/oauth/authorize" autocomplete="on">
  ${hidden('response_type', params.responseType)}
  ${hidden('client_id', params.clientId)}
  ${hidden('redirect_uri', params.redirectUri)}
  ${hidden('code_challenge', params.codeChallenge)}
  ${hidden('code_challenge_method', params.codeChallengeMethod)}
  ${hidden('state', params.state)}
  <label for="email">Correo institucional</label>
  <input id="email" name="email" type="email" inputmode="email" autocomplete="username" required
    value="${escapeHtml(options.email ?? '')}" placeholder="estudiante@unisabana.edu.co">
  <label for="password">Contraseña</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <button type="submit">Entrar y volver a la app</button>
</form>
<footer>OAuth 2.0 · Authorization Code + PKCE (S256)</footer>`,
  );
}

/** Respaldo por si el navegador no sigue automáticamente el 302 a un esquema no-http (exp://, unisabana-auth://). */
export function redirectPage(location: string): string {
  return layout(
    'Volviendo a la app…',
    `<h1>Autenticación completada</h1>
<p class="muted">Si la app no se abrió automáticamente, toca el botón.</p>
<a class="button" href="${escapeHtml(location)}">Volver a la app</a>`,
  );
}

export function errorPage(title: string, message: string): string {
  return layout(title, `<h1>${escapeHtml(title)}</h1><p class="alert">${escapeHtml(message)}</p>`);
}

export function enrollPage(qrDataUrl: string, secret: string, otpauthUri: string): string {
  const grouped = secret.replace(/(.{4})/g, '$1 ').trim();
  return layout(
    'Enrolar 2FA · Solo desarrollo',
    `<p class="warn"><strong>SOLO PARA DESARROLLO.</strong> Esta página expone la semilla TOTP para el laboratorio.
Desactívala con DEV_ENROLL_PAGE=false.</p>
<h1>Enrolar autenticador</h1>
<p class="muted">Escanea este QR con la app del laboratorio <em>y</em> con Google Authenticator: ambos deben mostrar el mismo código.</p>
<img class="qr" src="${qrDataUrl}" alt="Código QR de la semilla TOTP">
<label>Semilla Base32 (entrada manual)</label>
<p class="mono secret">${escapeHtml(grouped)}</p>
<label>URI otpauth</label>
<p class="mono muted">${escapeHtml(otpauthUri)}</p>
<footer>RFC 6238 · SHA-1 · 6 dígitos · 30 s</footer>`,
  );
}
