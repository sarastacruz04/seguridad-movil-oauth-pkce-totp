# CHECKLIST — auto-auditoría del laboratorio

Leyenda: ✅ cumplido y verificado automáticamente · 📱 verificado **manualmente en un teléfono Android con Expo Go** (2026-11-06) · ⚠️ parcial · ⏳ pendiente.
Rutas: `M/` = `mobile-app/src/`, `B/` = `backend-auth/src/`. Verificación: **T-B** = `backend-auth npm test` (43), **T-M** = `mobile-app npm test` (33), **S** = `npm run smoke`, **TC** = `tsc --noEmit`, **E** = `expo export` + inspección del bundle.

Última verificación completa: typecheck app/tests/backend ✅ · `expo lint` sin hallazgos ✅ · T-B 43/43 ✅ · T-M 33/33 ✅ · S 10/10 ✅ · `expo-doctor` 20/20 ✅ · las 5 pruebas de aceptación 📱.

## Confirmaciones explícitas

| Regla | Estado | Evidencia |
|---|---|---|
| Sin librerías de TOTP (otplib, speakeasy, otpauth…) | ✅ | Ninguna en `package.json` ni en `node_modules`; TOTP propio en `M/lib/totp/totpCore.ts` y `B/lib/totp.ts` |
| Sin expo-auth-session ni librerías OAuth/PKCE | ✅ | PKCE en `M/lib/pkce/pkceCore.ts`; flujo en `M/auth/oauthFlow.ts` |
| Sin WebView embebida | ✅ 📱 | `react-native-webview` no está instalado. El login se hace con `WebBrowser.openAuthSessionAsync` (Custom Tab con barra de URL). Nota: el bundle contiene el texto "react-native-webview" porque el núcleo de `expo` (DOM components) hace un `require` opcional dentro de un `try`; nunca se ejecuta |
| Sin `client_secret` en la app | ✅ | `grep` sin coincidencias en `M/` y en el bundle (E); `.env.example` solo trae la URL pública |
| Sin AsyncStorage (ni MMKV / archivos) para secretos | ✅ | No instalado; el bundle no lo contiene (E). Secretos solo en `M/storage/secureStorage.ts` |
| TypeScript estricto | ✅ | `"strict": true` + `noImplicitReturns`, `noUnusedLocals`, etc. en ambos `tsconfig`; sin `any` ni `@ts-ignore` (grep); errores con clases tipadas (`M/api/errors.ts`, `InvalidBase32Error`, `ConfigError`…) |
| Backend 403 → 200 → 409 | ✅ 📱 | T-B "bóveda: 403 con access → verify 200 → bóveda 200 → mismo código 409", S pasos 05–08 y escenarios 4–5 en el teléfono |

## Punto 1 — OAuth 2.0 + PKCE

| Requisito | Estado | Dónde (archivo · función) | Verificación |
|---|---|---|---|
| `code_verifier` 43–128 chars URL-safe de alta entropía | ✅ | `M/lib/pkce/pkceCore.ts` · `generateCodeVerifier` (48 bytes → 64 chars) | T-M "PKCE" |
| `code_challenge` = Base64URL sin relleno de SHA-256 | ✅ 📱 | `computeCodeChallenge`, `M/lib/crypto/base64url.ts` · `base64UrlEncode` | T-M vector RFC 7636 + Base64URL vs Node (0–64 bytes); self-test en el teléfono |
| Navegador seguro del sistema (no WebView) | ✅ 📱 | `M/auth/oauthFlow.ts` · `signInWithSystemBrowser` (`openAuthSessionAsync`, `preferEphemeralSession`, `useProxyActivity: false`) | Código + bundle; Custom Tab de Chrome en el teléfono |
| Deep link de retorno | ✅ 📱 | `app.json` (`scheme: unisabana-auth`), `M/lib/oauth/redirectUri.ts` · `resolveRedirectUri` (`exp://…/--/callback` en Expo Go), `M/app/callback.tsx` | T-M "redirect_uri según el entorno"; retorno real a la app en el teléfono, varios logins seguidos |
| `state` anti-CSRF aleatorio, único, en memoria y validado; aborta si no coincide | ✅ 📱 | `generateState`, `pendingState` en `M/auth/oauthFlow.ts`; `M/lib/oauth/authorizeRequest.ts` · `isStateValid`, `parseCallbackUrl` | T-M "Validación anti-CSRF del state", "Deep link de retorno". En el teléfono también se vio actuar: una pestaña vieja de Chrome devolvió un `state` anterior y la app abortó el canje (ver README → Decisiones, "actividad proxy") |
| Token exchange con code + verifier; backend valida `SHA256(verifier) == challenge` | ✅ 📱 | `M/api/endpoints.ts` · `exchangeAuthorizationCode`; `B/routes/oauth.ts` (`/auth/oauth/token`), `B/lib/pkce.ts` · `verifyPkce` | T-B "PKCE con verifier incorrecto…", "code de un solo uso", "redirect_uri distinto", "code expirado"; S 03–04; consola `[PKCE] ok` en cada login del teléfono |
| Backend rechaza `plain`, valida allowlist y no hace open redirect | ✅ | `B/oauth/authorizeParams.ts` · `validateAuthorizeParams`, `isAllowedRedirectUri` | T-B "GET /oauth/authorize" (4 casos) |

## Punto 2 — Almacenamiento seguro y Silent Refresh

| Requisito | Estado | Dónde | Verificación |
|---|---|---|---|
| `access_token` solo en memoria (5 min) | ✅ 📱 | `M/auth/tokenStore.ts` (variable de módulo) | Revisión de código; Laboratorio: "access_token en RAM: Sí" |
| `refresh_token` en SecureStore (Keychain/Keystore), 30 días | ✅ 📱 | `M/storage/secureStorage.ts` · `refreshTokenStorage` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); `M/auth/AuthProvider.tsx` · `signIn` | Laboratorio: "refresh_token en SecureStore: Sí" |
| Interceptor HTTP (axios) que agrega el Bearer | ✅ | `M/api/createApiClients.ts` · interceptor de request | T-M "con token válido no hay refresh" |
| 401 → pausar/encolar, UN solo `POST /auth/refresh`, reintentar y desbloquear | ✅ 📱 | `refreshAccessToken` (promesa compartida), interceptores de request y response | T-M "5 peticiones concurrentes… UN solo POST /auth/refresh", "peticiones lanzadas DURANTE el refresh se pausan"; en el teléfono: 1 refresh, 4 en cola, 5 "Reintento OK" |
| Refresh vencido/revocado → limpiar SecureStore y navegar a Bienvenida | ✅ 📱 | `performRefresh` · `expireSession`; `M/auth/sessionEvents.ts`; `AuthProvider` + `Stack.Protected` en `M/app/_layout.tsx` | T-M "refresh revocado → SessionExpiredError…"; botón "Simular refresh_token revocado" en el teléfono |
| Sin red no cierra sesión | ✅ | `performRefresh` (`NetworkError`) | T-M "sin red → NetworkError y el refresh_token se CONSERVA" |
| Arranque en frío con silent refresh tras el splash | ✅ ⏳ | `AuthProvider` (efecto inicial), `SplashScreen.preventAutoHideAsync` | Revisión de código; ⏳ prueba opcional: con sesión iniciada, cerrar Expo Go del todo y volver a abrir → debe entrar sin pedir login |
| Laboratorio: invalidar token, 5 concurrentes, log, estado enmascarado, redirectUri, self-tests | ✅ 📱 | `M/app/(app)/(tabs)/laboratorio.tsx`, `M/components/SecurityLogList.tsx`, `M/components/SelfTestPanel.tsx` | Usado en el teléfono |

## Punto 3 — Authenticator TOTP propio

| Requisito | Estado | Dónde | Verificación |
|---|---|---|---|
| Sin librerías de TOTP; solo SHA-1 nativo + Base32 propio | ✅ | `M/lib/totp/base32.ts`, `M/lib/crypto/hmac.ts` · `hmac`, `M/lib/crypto/expoCrypto.ts` | T-M HMAC manual vs `createHmac`; RFC 2202 casos 1 y 6 |
| T = floor(unix/30) en 8 bytes big-endian | ✅ | `M/lib/totp/totpCore.ts` · `getTimeStep`, `counterToBytes` | T-M "contador de 8 bytes big-endian, también > 2^32" |
| HMAC-SHA1 + truncamiento dinámico exacto + `padStart(6)` | ✅ 📱 | `dynamicTruncate`, `createTotpEngine` | T-M RFC 4226 (10) + RFC 6238 (6); paridad con el backend en 20 ventanas; mismos dígitos que Google Authenticator en el teléfono |
| Ingesta A: QR con cámara (`otpauth://`) | ✅ 📱 | `M/app/(app)/scan.tsx` (`CameraView`, `barcodeTypes: ['qr']`, lectura única), `M/lib/totp/otpauth.ts` · `parseOtpauthUri` | T-M "Parser otpauth://"; enrolamiento hecho en el teléfono |
| Ingesta B: pegar semilla con validación | ✅ | `M/components/ManualSecretForm.tsx`, `validateBase32Secret` | T-M "Base32 valida con mensajes específicos" |
| Tipografía monoespaciada grande | ✅ 📱 | `M/components/CodeDisplay.tsx` (Menlo / monospace, 52 pt, "054 231") | Visual en el teléfono |
| Temporizador gráfico 30 → 0 que regenera el código | ✅ 📱 | `M/components/CountdownBar.tsx`, `M/authenticator/useTotpCode.ts` (precálculo de T+1, `useNativeDriver`, `AppState`) | Visual en el teléfono |
| 100 % offline (Modo Avión) | ✅ 📱 | `useTotpCode` y `totpCore` no importan ningún cliente HTTP; tiempo de `Date.now()` | Revisión de imports; Modo Avión real en el teléfono |

## Punto 4 — Step-up y anti-replay

| Requisito | Estado | Dónde | Verificación |
|---|---|---|---|
| `GET /api/boveda-critica` con access estándar → 403 `mfa_required` + `step_up_token` | ✅ 📱 | `B/routes/api.ts` · `boveda` | T-B, S 05, escenario 4 |
| `POST /auth/mfa/verify` valida step_up + código | ✅ | `B/routes/session.ts` | T-B "step_up_token inválido → 401", "formato inválido → 400" |
| Ventanas C-1, C, C+1 | ✅ | `B/lib/totp.ts` · `verifyTotp` (comparación en tiempo constante de las 3) | T-B "acepta C-1 y C+1, rechaza C+2" |
| Caché anti-replay TTL 90 s → 409 Replay Attack Detected | ✅ 📱 | `B/stores/replayCache.ts`, `B/routes/session.ts` | T-B "…mismo código 409", "el caché expira a los 90 s"; S 08; escenario 5 |
| `elevated_token` con `mfa_verified: true`, 10 min | ✅ | `B/routes/session.ts`, `B/lib/jwt.ts` | T-B (`expires_in` 600, vence a los 601 s) |
| App: la pantalla captura el 403 y abre el modal 2FA | ✅ 📱 | `M/app/(app)/(tabs)/boveda.tsx` · `requestVault`, `M/components/StepUpModal.tsx` | T-M "403 mfa_required NO dispara refresh"; escenario 4 |
| Demo de replay desde la app | ✅ 📱 | `boveda.tsx` · `replayLastCode`, `M/auth/stepUpMemory.ts` | Escenario 5 |
| Rate limit 5 fallos/min → 429 | ✅ | `B/stores/failureRateLimiter.ts` | T-B "5 fallos en un minuto → 429" |

## Pruebas de aceptación (sustentación)

| # | Escenario | Estado | Cómo se demuestra (pasos exactos en README §5) |
|---|---|---|---|
| 1 | OAuth + PKCE con navegador del sistema | ✅ 📱 | Iniciar sesión → Custom Tab con barra de URL → credenciales → vuelve sola a la app → Laboratorio: "refresh_token en SecureStore: Sí"; consola: `[PKCE] ok`. Funciona también en logins repetidos tras cerrar sesión |
| 2 | Paridad TOTP con Google Authenticator | ✅ 📱 | Mismo QR de `/mfa/enroll` en la app y en Google Authenticator → mismos 6 dígitos; self-tests 19/19 |
| 3 | Cálculo offline en Modo Avión | ✅ 📱 | Modo Avión, esperar a que la barra llegue a 0 → código nuevo sin error ni parpadeo |
| 4 | Step-up y Bóveda | ✅ 📱 | Bóveda → 403 → modal 2FA → código → datos sensibles; consola `[BOVEDA] 403` y luego `200` |
| 5 | Anti-replay (409) | ✅ 📱 | "Reenviar último código usado" → "Ataque bloqueado · 409 Conflict: Replay Attack Detected" |

## Entregables

| Entregable | Estado | Dónde |
|---|---|---|
| `/mobile-app` (React Native / Expo) | ✅ | `mobile-app/` (Expo SDK 58, `expo-doctor` 20/20) |
| `/backend-auth` (Express) | ✅ | `backend-auth/` |
| README paso a paso (backend, variables, app) | ✅ | `README.md` §1–4, troubleshooting §7, decisiones §8, limitaciones §9 |
| Guion de sustentación + guion de video | ✅ | `README.md` §5 |
| Video de 60–90 s (opcional) | ⏳ | Lo graba la estudiante siguiendo el guion |
| Explicación y diagramas | ✅ | `docs/EXPLICACION.md` (3 diagramas mermaid, preguntas de sustentación) |
| Repositorio Git con commits convencionales | ✅ ⏳ | `git log` local; ⏳ subirlo a GitHub (`git push`) |

## Rúbrica

| Criterio (peso) | Estado | Justificación |
|---|---|---|
| TOTP RFC 6238 (25 %) | ✅ 📱 | Desde cero (HMAC + truncamiento), 16 vectores RFC + paridad cruzada; Modo Avión y paridad con Google Authenticator comprobados en el teléfono |
| OAuth 2.0 + PKCE + deep linking (25 %) | ✅ 📱 | Verifier/challenge válidos (vector RFC), navegador del sistema, deep link, `state` validado y de un solo uso (incluso se vio rechazar un `state` viejo), sin `client_secret` |
| Almacenamiento seguro + Silent Refresh Queue (20 %) | ✅ 📱 | access en RAM, refresh en SecureStore, cola de promesas (5 → 1 refresh) probada contra el backend real y en el teléfono, y expiración que lleva a Bienvenida |
| Step-up + anti-replay (15 %) | ✅ 📱 | 403 sin MFA, elevación tras 2FA, 409 en replay, 429 por fuerza bruta, `step_up_token` nunca da acceso |
| UI/UX y código limpio (15 %) | ✅ 📱 | Contador animado en el hilo nativo, sin parpadeo, teclado numérico `oneTimeCode`, errores descriptivos en español, tema claro/oscuro, módulos separados, TS estricto, ESLint + Prettier sin hallazgos |

## Resumen

```bash
# Backend
cd backend-auth && npm install && cp .env.example .env && npm run dev
npm test && npm run smoke            # en otra terminal, con el backend encendido
# App
cd mobile-app && npm install && cp .env.example .env   # EXPO_PUBLIC_API_URL=http://<IP-LAN>:3000
npm test && npm run typecheck && npm run lint
npx expo start                        # WSL en NAT: ver README §2 (mirrored o portproxy)
```

**Pendiente:** subir el repositorio a GitHub; grabar el video opcional; y, si quieres, la prueba opcional de arranque en frío (con sesión iniciada, cerrar Expo Go del todo y volver a abrir: debe entrar sin pedir login).
