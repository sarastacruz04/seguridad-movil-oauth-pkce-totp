# Seguridad Móvil — OAuth 2.0 con PKCE, almacenamiento cifrado y Step-Up 2FA (TOTP)

Laboratorio de la Sesión 14 de **Desarrollo Móvil** (Universidad de La Sabana). Es una prueba de concepto **sin librerías "caja negra"**:

| Punto | Qué se implementa | Dónde |
|---|---|---|
| 1 | OAuth 2.0 Authorization Code + **PKCE S256** (RFC 7636) con el **navegador del sistema**, deep link y `state` anti-CSRF | `mobile-app/src/auth/oauthFlow.ts`, `mobile-app/src/lib/pkce`, `backend-auth/src/routes/oauth.ts` |
| 2 | `access_token` solo en RAM, `refresh_token` en **Keychain/Keystore** (`expo-secure-store`) y **cola de silent refresh** ante 401 | `mobile-app/src/api/createApiClients.ts`, `mobile-app/src/storage` |
| 3 | **Authenticator TOTP propio** (RFC 6238/4226): HMAC-SHA1 a mano + truncamiento dinámico, QR o semilla manual, 100 % offline | `mobile-app/src/lib/totp`, `mobile-app/src/lib/crypto/hmac.ts` |
| 4 | **Step-up** en la bóveda (403 `mfa_required` → 2FA → `elevated_token`) y **anti-replay** (409) | `backend-auth/src/routes/session.ts`, `mobile-app/src/app/(app)/(tabs)/boveda.tsx` |

Explicación detallada, diagramas y preguntas de sustentación: [docs/EXPLICACION.md](docs/EXPLICACION.md). Auditoría requisito por requisito: [CHECKLIST.md](CHECKLIST.md).

```
/mobile-app     App Expo SDK 58 (React Native 0.88, Expo Router, TypeScript estricto)
/backend-auth   Backend Node.js + Express 5 + TypeScript, todo en memoria
/docs           EXPLICACION.md (módulos, diagramas mermaid, preguntas)
```

---

## 1. Prerrequisitos

- **Node.js 22.13+** (o 24.3+ / 26). Comprobar con `node -v`. Este repo se desarrolló con Node 22.20 dentro de WSL (Ubuntu).
- **Expo Go** compatible con **SDK 58** en el teléfono (App Store / Play Store), o un emulador Android / simulador iOS.
- Teléfono y PC **en la misma red Wi-Fi** (las redes universitarias suelen aislar los dispositivos entre sí; un hotspot del propio teléfono funciona bien).
- Opcional para el escenario 2: **Google Authenticator** en el teléfono.

## 2. Red: que el teléfono vea el backend

El teléfono **no** puede usar `localhost`: `localhost` en el teléfono es el propio teléfono.

1. **IP LAN de tu PC**
   - Windows: `ipconfig` → "Adaptador de LAN inalámbrica Wi-Fi" → *Dirección IPv4* (p. ej. `10.0.3.247`).
   - macOS: `ipconfig getifaddr en0`. Linux: `hostname -I`.
2. **Firewall**: permite el puerto **3000** (backend) y **8081** (Metro). En Windows (PowerShell como administrador):
   ```powershell
   New-NetFirewallRule -DisplayName "Lab Seguridad Movil" -Direction Inbound -Protocol TCP -LocalPort 3000,8081 -Action Allow
   ```
3. **Si usas WSL 2 en modo NAT** (el caso de este repo: `wslinfo --networking-mode` → `nat`), el teléfono solo ve la IP Wi-Fi de Windows, no la de WSL (`172.x`). Hay dos opciones:
   - **Opción A (recomendada, Windows 11):** activa la red espejo. En `%UserProfile%\.wslconfig` pon
     ```ini
     [wsl2]
     networkingMode=mirrored
     ```
     y ejecuta `wsl --shutdown`. WSL pasa a compartir la IP de Windows.
   - **Opción B:** reenvía los puertos desde Windows (PowerShell como administrador; repítelo si cambia la IP de WSL):
     ```powershell
     $wslIp = (wsl -d Ubuntu hostname -I).Trim().Split(' ')[0]
     netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3000 connectaddress=$wslIp connectport=3000
     netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=8081 connectaddress=$wslIp connectport=8081
     ```
     y arranca Metro anunciando la IP de Windows: `REACT_NATIVE_PACKAGER_HOSTNAME=10.0.3.247 npx expo start`.
4. **Comprueba desde el navegador del teléfono**: `http://<IP-de-tu-PC>:3000/health` debe responder `{"status":"ok",…}`.

> **HTTP en texto plano:** en desarrollo el tráfico va por HTTP en la LAN para simplificar la demo. En producción el proveedor de identidad y la API irían **solo por HTTPS** (TLS), y en iOS/Android no se permitiría tráfico *cleartext*.

## 3. Backend (`/backend-auth`)

```bash
cd backend-auth
npm install
cp .env.example .env      # ajusta los valores
npm run dev               # tsx watch → http://0.0.0.0:3000
```

Al arrancar imprime las URLs LAN detectadas, los TTL activos y avisos (WSL, `JWT_SECRET` vacío). Los logs muestran cada paso: `[PKCE] ok`, `[REFRESH] ok`, `[MFA] código inválido`, `[MFA] REPLAY DETECTADO…`.

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Escucha en todas las interfaces para que llegue el teléfono |
| `DEMO_PASSWORD` | `Sabana2026!` | Contraseña de `estudiante@unisabana.edu.co` |
| `TOTP_SECRET` | `JBSWY3DPEHPK3PXP` | Semilla Base32 compartida (la misma del QR) |
| `JWT_SECRET` | vacío → aleatorio por arranque | Clave HMAC de los JWT HS256. Fíjala para que los tokens sobrevivan a un reinicio |
| `ACCESS_TOKEN_TTL_SECONDS` | `300` | 5 min. **Bájalo a `15`** para demostrar el silent refresh en vivo |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Vida del refresh token |
| `STEP_UP_TTL_SECONDS` | `300` | Vida del `step_up_token` |
| `ELEVATED_TTL_SECONDS` | `600` | Vida del `elevated_token` (10 min) |
| `AUTH_CODE_TTL_SECONDS` | `60` | Vida del authorization code |
| `REPLAY_TTL_SECONDS` | `90` | Memoria del caché anti-replay (= 3 ventanas TOTP) |
| `DEV_ENROLL_PAGE` | `true` | Habilita `/mfa/enroll` (QR de la semilla). **Solo desarrollo** |

Otros scripts: `npm test` (43 pruebas), `npm run smoke` (flujo completo contra el servidor encendido), `npm run typecheck`, `npm run build && npm start`.

**Endpoints:** `GET|POST /oauth/authorize`, `POST /auth/oauth/token`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/mfa/verify`, `GET /api/me`, `GET /api/boveda-critica` (alias `/api/boveda`), `GET /mfa/enroll`, `GET /health`. Los errores siempre son `{ "error", "message" }`.

## 4. App móvil (`/mobile-app`)

```bash
cd mobile-app
npm install
cp .env.example .env      # EXPO_PUBLIC_API_URL=http://<IP-LAN-de-tu-PC>:3000
npx expo start            # escanea el QR con Expo Go (Android) o con la cámara (iOS)
```

- Emulador Android: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`. Simulador iOS: `http://localhost:3000`.
- Si cambias `.env`, reinicia Metro (`npx expo start -c`): las variables `EXPO_PUBLIC_*` se incrustan al empaquetar.
- `.env` solo contiene la URL pública del backend. **Nunca** hay un `client_secret`: la app es un *cliente público* y la seguridad del canje la da PKCE.

Scripts: `npm test` (29 pruebas en Node), `npm run typecheck` (app + tests), `npm run lint`, `npm run format`.

### Expo Go vs. build de desarrollo (redirect URI)

| Entorno | `redirect_uri` efectivo (`Linking.createURL('callback')`) |
|---|---|
| **Expo Go** | `exp://<IP>:8081/--/callback` (Expo Go no puede registrar el esquema propio) |
| **Build de desarrollo** (`npx expo run:android` / `run:ios`) | `unisabana-auth://callback` (esquema de `app.json`) |

El backend acepta ambos prefijos (`unisabana-auth://`, y `exp://` / `exps://` solo para desarrollo). La pantalla **Laboratorio** muestra el `redirect_uri` real que está usando la app.

### Enrolar la semilla TOTP

1. En el PC abre `http://<IP>:3000/mfa/enroll` → QR de `otpauth://totp/UniSabana:estudiante@unisabana.edu.co?secret=JBSWY3DPEHPK3PXP&issuer=UniSabana`.
2. En la app → pestaña **Authenticator** → **Escanear QR** (o pega la semilla en la opción B; imprescindible en emuladores).
3. En Google Authenticator → **+** → *Escanear un código QR* → el mismo QR.

El código depende del **reloj del teléfono**: activa *Fecha y hora automáticas*. Un desfase de más de ±30 s hace que el backend rechace el código (solo tolera C-1, C y C+1).

---

## 5. Guion de sustentación (5 minutos)

**Antes de entrar:** backend encendido (`npm run dev`), Metro encendido, app abierta en la pestaña Authenticator con la semilla ya enrolada, Google Authenticator con la misma cuenta y `/mfa/enroll` abierto en el PC. Sesión **cerrada** (Perfil → Cerrar sesión). Hora automática activada.

| # | Paso exacto | Resultado esperado | Qué decir |
|---|---|---|---|
| 1 · OAuth + PKCE (≈70 s) | En *Bienvenida*, tocar **Iniciar sesión**. Se abre el navegador del sistema (Custom Tab / hoja de Safari; se ve la barra de URL). Escribir `estudiante@unisabana.edu.co` y la contraseña → **Entrar y volver a la app**. Ir a **Laboratorio**. | La app vuelve sola por deep link y entra a las pestañas. En Laboratorio: *access_token en RAM: Sí · eyJhbG…*, *refresh_token en SecureStore: Sí · xxxxxx…*, y el `redirect_uri` usado. En el registro: "PKCE generado", "state verificado", "Tokens recibidos". En la consola del backend: `[PKCE] ok`. | "La contraseña se escribe en el navegador, no en la app (no hay WebView). La app mandó solo el `code_challenge`; para canjear el code envió el `code_verifier` y el servidor comprobó que SHA-256 del verifier es el challenge. El `state` se validó antes del canje. El refresh token está en Keychain/Keystore; el access token solo en memoria." |
| 2 · Paridad TOTP (≈40 s) | Mostrar lado a lado la pestaña **Authenticator** y **Google Authenticator** (mismo QR de `/mfa/enroll`). Opcional: **Laboratorio → Ejecutar self-tests**. | Los 6 dígitos coinciden y cambian al mismo tiempo. Self-tests: *19/19 vectores correctos* (RFC 2202, 4226, 6238, 7636). | "T = floor(unix/30) en 8 bytes big-endian, HMAC-SHA1 escrito a mano sobre el SHA-1 nativo, truncamiento dinámico con offset = H[19] & 0x0F, módulo 10⁶." |
| 3 · Modo Avión (≈45 s) | Activar **Modo Avión** (y desactivar Wi-Fi). Quedarse en Authenticator y esperar a que la barra llegue a 0. | La barra se pone roja en los últimos 5 s y en el límite aparece el código nuevo **sin parpadeo** ni error. | "No hay ninguna petición de red: el tiempo es `Date.now()` y el SHA-1 es local. El siguiente código ya estaba precalculado." **Desactivar el Modo Avión** antes de seguir. |
| 4 · Step-up y Bóveda (≈60 s) | Pestaña **Bóveda**. Se abre el modal *Verificación en dos pasos*. Tocar **Usar mi Authenticator integrado** (o teclear el código de Google Authenticator con el teclado numérico) → **Verificar**. | Primero la bóveda está bloqueada (el backend respondió **403 `mfa_required`**, log `[BOVEDA] 403`). Tras verificar: banner "Acceso autorizado con 2FA" con cuenta regresiva de 10 min y los datos sensibles. Backend: `[MFA] código OK en ventana C` y `[BOVEDA] 200`. | "La pantalla, no el interceptor, captura el 403 y abre el modal con el `step_up_token`. Con un código válido el servidor emite un `elevated_token` con `mfa_verified: true`, que vive solo en memoria." |
| 5 · Anti-replay (≈30 s) | Inmediatamente (antes de 90 s), en la misma pantalla, **Reenviar último código usado**. | Tarjeta verde "**Ataque bloqueado** · 409 Conflict: Replay Attack Detected". Backend: `[MFA] REPLAY DETECTADO … → 409`. | "La app pidió un `step_up_token` nuevo y reenvió el mismo código. El código es válido en su ventana, pero el servidor lo recuerda 90 s por usuario y lo rechaza con 409." |

**Si sobra tiempo (silent refresh, Punto 2):** Laboratorio → **Invalidar access token en memoria** → **Disparar 5 peticiones concurrentes a /api/me** → "5/5 respuestas 200" y en el registro **un solo** "POST /auth/refresh iniciado", varias líneas "N petición(es) esperando en cola", "Refresh OK · se liberan N…" y cinco "Reintento OK" (N depende de cuántos 401 llegan antes de que termine el refresh; normalmente 4). Con **Simular refresh_token revocado** la app vuelve sola a Bienvenida con "Tu sesión expiró".

### Guion del video de respaldo (60–90 s)

1. **0–5 s:** "Laboratorio de Seguridad Móvil, Universidad de La Sabana." Mostrar la Bienvenida.
2. **5–30 s:** Iniciar sesión: se ve el navegador del sistema con su barra de URL, login y regreso automático a la app. Narrar: "PKCE S256: la app envía el challenge; el verifier solo viaja en el canje. El `state` se valida contra el que la app guardó en memoria."
3. **30–40 s:** Laboratorio: refresh_token en SecureStore, access_token solo en RAM, `redirect_uri` efectivo.
4. **40–75 s:** Authenticator junto a Google Authenticator (mismo código). Activar el Modo Avión en el centro de control, esperar el cambio de 30 → 0 y mostrar el código nuevo. "Sin red: HMAC-SHA1 y truncamiento dinámico calculados en el teléfono."
5. **75–90 s:** (con red) Bóveda → 2FA → datos → "Reenviar último código usado" → 409.

---

## 6. Pruebas automatizadas

| Comando | Qué verifica |
|---|---|
| `cd backend-auth && npm test` | Vectores RFC 4226 (HOTP 0–9), RFC 6238 (6 tiempos), RFC 7636 (apéndice B), Base32, JWT (firma, expiración, `alg: none`), ventanas C-1/C/C+1, authorize (plain rechazado, open redirect, exp://), code de un solo uso y expirado, PKCE incorrecto, refresh/logout, 403→200→409, caché de 90 s, 429, step-up inválido |
| `cd backend-auth && npm run smoke` | Flujo real contra el servidor encendido: PKCE → authorize (302) → token → 403 → TOTP → 200 → bóveda 200 → 409 → refresh OK → refresh inválido 401. Si un código ya se usó en una ejecución anterior, espera a la siguiente ventana |
| `cd mobile-app && npm test` | Self-tests RFC del núcleo de la app, Base64URL manual vs. Node, HMAC manual vs. `createHmac` (claves cortas, de 64 y largas), paridad TOTP app ↔ backend (implementaciones independientes), parser otpauth, PKCE, URL de autorización, parseo del deep link, `state`, y la **cola de refresh contra el backend real** (5 concurrentes → 1 refresh; refresh revocado → `SessionExpiredError`; sin red → se conserva el refresh_token; 403 no dispara refresh) |
| `npm run typecheck` (ambos) | `tsc --noEmit` en modo estricto |

## 7. Solución de problemas

| Síntoma | Causa probable y solución |
|---|---|
| "Sin conexión con el servidor" / el login no abre | `EXPO_PUBLIC_API_URL` apunta a `localhost` o a otra IP; el firewall bloquea el 3000; WSL en NAT sin portproxy (§2); red con aislamiento de clientes. Prueba `http://<IP>:3000/health` desde el navegador del teléfono y reinicia Metro con `-c` tras cambiar `.env` |
| El navegador muestra "redirect_uri no está en la lista permitida" | El `redirect_uri` no empieza por `unisabana-auth://`, `exp://` ni `exps://`. Revisa el valor en Laboratorio |
| Tras el login el navegador no vuelve a la app | Toca el botón **Volver a la app** de la página de respaldo. En Android, asegúrate de abrir el proyecto desde Expo Go (no desde un navegador) |
| "state no coincide (posible ataque CSRF)" | El deep link no corresponde al intento en curso (p. ej. se reabrió un enlace viejo). Vuelve a iniciar sesión: cada intento genera un `state` nuevo de un solo uso |
| El código no coincide con Google Authenticator o el backend responde 400 | Reloj del teléfono o del PC desfasado: activa la hora automática en ambos. Confirma que ambos escanearon el mismo QR (misma semilla) |
| 429 en el 2FA | 5 intentos fallidos en un minuto. Espera 60 s |
| 409 en el primer intento | Ese código ya se usó en los últimos 90 s (otro dispositivo o el smoke test). Espera al siguiente código |
| La cámara no abre | Concede el permiso (o *Abrir ajustes*). En emuladores usa la opción B (pegar semilla) |

## 8. Decisiones de diseño

- **Backend en Node + Express 5 + TypeScript**, todo en memoria (sin BD ni Docker). Reloj inyectable para poder probar expiraciones y ventanas TOTP de forma determinista.
- **JWT HS256 escrito a mano**: se fija `alg = HS256` (se rechaza `none`), firma comparada con `timingSafeEqual`, claims `sub, iat, exp, typ, mfa_verified` + `jti` aleatorio. Tres tipos: `access`, `step_up` (nunca da acceso a recursos) y `elevated`.
- **Errores de `/oauth/authorize` en dos niveles**: si `client_id` o `redirect_uri` no son confiables se muestra un error y **no se redirige** (evita *open redirect*); los demás errores (p. ej. `plain`) vuelven a la app como `?error=…&state=…`.
- **El authorization code se borra antes de validar nada**: un code interceptado no admite ni un segundo intento, aunque el atacante pruebe con otro verifier.
- **Refresh token opaco** (32 bytes) guardado en el servidor **solo como SHA-256**. **No se rota** en cada uso para mantener la demo simple y compatible con peticiones concurrentes; en producción se rotaría con detección de reutilización.
- **`/auth/mfa/verify` responde 400** ante código incorrecto o mal formado (no 401) para no activar la cola de refresh; un `step_up_token` inválido responde 401, pero `/auth/*` está excluido del interceptor.
- **`step_up_token` reutilizable** dentro de su vida (5 min), tal como pide el enunciado; el bloqueo de reutilización lo da el **caché anti-replay** (`userId:código`, 90 s), que se consulta *después* de validar el código, así un código inventado no "ensucia" el caché.
- **Rate limit**: 5 fallos por minuto y usuario → 429. Los replays no cuentan como fallo, para poder repetir la demo.
- **Cola de refresh**: una única promesa compartida. Las peticiones que reciben 401 la esperan y, además, las peticiones nuevas se **pausan** en el interceptor de request mientras hay un refresh en curso. Si una respuesta 401 llega cuando el token ya fue renovado por otra, se reintenta sin refrescar de nuevo.
- **Arranque en frío sin red**: si el refresh falla por red, la sesión se conserva (`signedIn` con aviso), porque el Authenticator funciona offline y el refresh_token sigue siendo válido. Si el servidor rechaza el refresh → `signedOut`.
- **La expiración de sesión no borra la semilla TOTP**: la semilla es el segundo factor del dispositivo, no parte de la sesión. Se borra solo con "Eliminar semilla".
- **SecureStore con `WHEN_UNLOCKED_THIS_DEVICE_ONLY`**: el secreto no se lee con el teléfono bloqueado ni migra en copias de seguridad.
- **Inyección de dependencias en el núcleo** (hash, CSPRNG, almacenamiento): el mismo código corre en Node (tests con `node:crypto`) y en el teléfono (`expo-crypto`). Los self-tests del Laboratorio son exactamente los mismos que los de `npm test`.
- **Pestañas JS (`expo-router/js-tabs`)** en lugar de `NativeTabs`: íconos y colores consistentes en ambas plataformas. Rutas protegidas con `Stack.Protected` (SDK 58).
- **Ruta `/callback`**: en Android el router también recibe el deep link de OAuth; la ruta solo redirige a `/` (el code y el state los procesa `oauthFlow` desde el resultado de `openAuthSessionAsync`).
- **`redirect_uri` calculado explícitamente** (`mobile-app/src/lib/oauth/redirectUri.ts`): en Expo Go SDK 58 sobre Android, `Linking.createURL('callback')` devolvió `unisabana-auth://callback`, un esquema que Expo Go no tiene registrado, y el navegador se quedaba en la página de login. Si la app detecta Expo Go (`expoVersion`, `appOwnership`, `expoGoConfig` o `linkingUri` con `exp://`), construye `exp://<host-de-Metro>/--/callback`; en un build propio usa `unisabana-auth://callback`. La Bienvenida y el Laboratorio muestran el valor efectivo.
- **`preferEphemeralSession: true`** (iOS): sesión de navegador privada, así la demo pide credenciales cada vez.
- **TypeScript 6.0** fijado en ambos proyectos (la plantilla de SDK 58 usa `~6.0.3`); `@types/node` 22 para coincidir con el runtime.
- **ESLint (`eslint-config-expo`) + Prettier**; `expo lint` sin advertencias.

## 9. Limitaciones conocidas

- Todo vive en memoria: reiniciar el backend invalida codes, refresh tokens, caché anti-replay y (si `JWT_SECRET` está vacío) todos los JWT.
- Un solo usuario demo y una sola semilla TOTP compartida (configurada por `.env`); no hay registro ni enrolamiento por usuario.
- `/mfa/enroll` expone la semilla: **solo desarrollo** (`DEV_ENROLL_PAGE=false` en cualquier otro entorno).
- La allowlist acepta cualquier `exp://`/`exps://` para que funcione Expo Go; en producción solo se aceptaría el esquema propio (o Universal/App Links verificados).
- HTTP en texto plano dentro de la LAN (en producción, HTTPS obligatorio).
- El TOTP depende de la hora del dispositivo; no hay sincronización NTP propia.
- La paridad con Google Authenticator, la cámara, el navegador del sistema y el Modo Avión se verifican manualmente (ver [CHECKLIST.md](CHECKLIST.md)).
