# CHECKLIST — auto-auditoría del laboratorio

Leyenda: ✅ cumplido y verificado automáticamente · ⚠️ parcial · ⏳ **PENDIENTE DE PRUEBA MANUAL** (requiere teléfono/cámara/Modo Avión).
Rutas: `M/` = `mobile-app/src/`, `B/` = `backend-auth/src/`. Verificación: **T-B** = `backend-auth npm test` (43), **T-M** = `mobile-app npm test` (29), **S** = `npm run smoke`, **TC** = `tsc --noEmit`, **E** = `expo export` + inspección del bundle.

Última verificación completa: typecheck app/tests/backend ✅ · `expo lint` sin hallazgos ✅ · T-B 43/43 ✅ · T-M 29/29 ✅ · S 10/10 ✅ · `expo-doctor` 20/20 ✅ · Metro sirve el manifiesto SDK 58 y el bundle Android (HTTP 200) ✅.

## Confirmaciones explícitas

| Regla | Estado | Evidencia |
|---|---|---|
| Sin librerías de TOTP (otplib, speakeasy, otpauth…) | ✅ | Ninguna en `package.json` ni en `node_modules`; TOTP propio en `M/lib/totp/totpCore.ts` y `B/lib/totp.ts` |
| Sin expo-auth-session ni librerías OAuth/PKCE | ✅ | PKCE en `M/lib/pkce/pkceCore.ts`; flujo en `M/auth/oauthFlow.ts` |
| Sin WebView embebida | ✅ | `react-native-webview` no está instalado. Login con `WebBrowser.openAuthSessionAsync`. Nota: el bundle contiene el texto "react-native-webview" porque el núcleo de `expo` (DOM components) hace un `require` opcional dentro de un `try`; nunca se ejecuta |
| Sin `client_secret` en la app | ✅ | `grep` sin coincidencias en `M/` y en el bundle (E); `.env.example` solo trae la URL pública |
| Sin AsyncStorage (ni MMKV / archivos) para secretos | ✅ | No instalado; el bundle no lo contiene (E). Secretos solo en `M/storage/secureStorage.ts` |
| TypeScript estricto | ✅ | `"strict": true` + `noImplicitReturns`, `noUnusedLocals`, etc. en ambos `tsconfig`; sin `any` ni `@ts-ignore` (grep); errores con clases tipadas (`M/api/errors.ts`, `InvalidBase32Error`, `ConfigError`…) |
| Backend 403 → 200 → 409 | ✅ | T-B "bóveda: 403 con access → verify 200 → bóveda 200 → mismo código 409" y S pasos 05–08 |

## Punto 1 — OAuth 2.0 + PKCE

| Requisito | Estado | Dónde (archivo · función) | Verificación |
|---|---|---|---|
| `code_verifier` 43–128 chars URL-safe de alta entropía | ✅ | `M/lib/pkce/pkceCore.ts` · `generateCodeVerifier` (48 bytes → 64 chars) | T-M "PKCE" |
| `code_challenge` = Base64URL sin relleno de SHA-256 | ✅ | `computeCodeChallenge`, `M/lib/crypto/base64url.ts` · `base64UrlEncode` | T-M vector RFC 7636 + Base64URL vs Node (0–64 bytes); self-test en el teléfono |
| Navegador seguro del sistema (no WebView) | ✅ ⏳ | `M/auth/oauthFlow.ts` · `signInWithSystemBrowser` (`openAuthSessionAsync`, `preferEphemeralSession`) | Código + bundle; ⏳ ver la Custom Tab / hoja de Safari en el teléfono |
| Deep link / esquema `unisabana-auth://callback` | ✅ ⏳ | `app.json` (`scheme`), `getRedirectUri` (`Linking.createURL`), `M/app/callback.tsx` | Manifiesto de Metro con `scheme: unisabana-auth`; ⏳ retorno real a la app |
| `state` anti-CSRF aleatorio, único, validado; aborta si no coincide | ✅ | `generateState`; `M/auth/oauthFlow.ts` · `completeAuthorization`; `M/lib/oauth/authorizeRequest.ts` · `isStateValid`, `parseCallbackUrl`. El intento vive en memoria y, solo mientras el navegador está abierto, cifrado en SecureStore (`pendingAuthorizationStorage`, caduca a los 10 min, un solo uso) para sobrevivir al reinicio de Expo Go en Android (ver README → Decisiones) | T-M "Validación anti-CSRF del state", "Deep link de retorno" |
| Token exchange con code + verifier; backend valida `SHA256(verifier) == challenge` | ✅ | `M/api/endpoints.ts` · `exchangeAuthorizationCode`; `B/routes/oauth.ts` (`/auth/oauth/token`), `B/lib/pkce.ts` · `verifyPkce` | T-B "PKCE con verifier incorrecto…", "code de un solo uso", "redirect_uri distinto", "code expirado"; S 03–04 |
| Backend rechaza `plain`, valida allowlist y no hace open redirect | ✅ | `B/oauth/authorizeParams.ts` · `validateAuthorizeParams`, `isAllowedRedirectUri` | T-B "GET /oauth/authorize" (4 casos) |

## Punto 2 — Almacenamiento seguro y Silent Refresh

| Requisito | Estado | Dónde | Verificación |
|---|---|---|---|
| `access_token` solo en memoria (5 min) | ✅ | `M/auth/tokenStore.ts` (variable de módulo) | Revisión de código; Laboratorio muestra "access_token en RAM" |
| `refresh_token` en SecureStore (Keychain/Keystore), 30 días | ✅ ⏳ | `M/storage/secureStorage.ts` · `refreshTokenStorage` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`); `M/auth/AuthProvider.tsx` · `signIn` | ⏳ Laboratorio → "refresh_token en SecureStore: Sí" en el teléfono |
| Interceptor HTTP (axios) que agrega el Bearer | ✅ | `M/api/createApiClients.ts` · interceptor de request | T-M "con token válido no hay refresh" |
| 401 → pausar/encolar, UN solo `POST /auth/refresh`, reintentar y desbloquear | ✅ | `refreshAccessToken` (promesa compartida), interceptores de request y response | T-M "5 peticiones concurrentes… UN solo POST /auth/refresh", "peticiones lanzadas DURANTE el refresh se pausan", "token expirado (TTL)" |
| Refresh vencido/revocado → limpiar SecureStore y navegar a Bienvenida | ✅ ⏳ | `performRefresh` · `expireSession`; `M/auth/sessionEvents.ts`; `AuthProvider` + `Stack.Protected` en `M/app/_layout.tsx` | T-M "refresh revocado → SessionExpiredError, se limpia SecureStore y se avisa UNA vez"; ⏳ botón "Simular refresh_token revocado" |
| Sin red no cierra sesión | ✅ | `performRefresh` (`NetworkError`) | T-M "sin red → NetworkError y el refresh_token se CONSERVA" |
| Arranque en frío con silent refresh tras el splash | ✅ ⏳ | `AuthProvider` (efecto inicial), `SplashScreen.preventAutoHideAsync` | Revisión de código; ⏳ cerrar y abrir la app |
| Laboratorio: invalidar token, 5 concurrentes, log, estado enmascarado, redirectUri, self-tests | ✅ ⏳ | `M/app/(app)/(tabs)/laboratorio.tsx`, `M/components/SecurityLogList.tsx`, `M/components/SelfTestPanel.tsx` | ⏳ en el teléfono |

## Punto 3 — Authenticator TOTP propio

| Requisito | Estado | Dónde | Verificación |
|---|---|---|---|
| Sin librerías de TOTP; solo SHA-1 nativo + Base32 propio | ✅ | `M/lib/totp/base32.ts`, `M/lib/crypto/hmac.ts` · `hmac`, `M/lib/crypto/expoCrypto.ts` | T-M HMAC manual vs `createHmac`; RFC 2202 casos 1 y 6 |
| T = floor(unix/30) en 8 bytes big-endian | ✅ | `M/lib/totp/totpCore.ts` · `getTimeStep`, `counterToBytes` | T-M "contador de 8 bytes big-endian, también > 2^32" |
| HMAC-SHA1 + truncamiento dinámico exacto + `padStart(6)` | ✅ | `dynamicTruncate`, `createTotpEngine` | T-M RFC 4226 (10) + RFC 6238 (6); paridad con el backend en 20 ventanas |
| Ingesta A: QR con cámara (`otpauth://`) | ✅ ⏳ | `M/app/(app)/scan.tsx` (`CameraView`, `barcodeTypes: ['qr']`, lectura única), `M/lib/totp/otpauth.ts` · `parseOtpauthUri` | T-M "Parser otpauth://" (ejemplo de la guía, percent-encoding, rechazos); ⏳ escaneo real |
| Ingesta B: pegar semilla con validación | ✅ | `M/components/ManualSecretForm.tsx`, `validateBase32Secret` | T-M "Base32 valida con mensajes específicos" |
| Tipografía monoespaciada grande | ✅ | `M/components/CodeDisplay.tsx` (Menlo / monospace, 52 pt, "054 231") | Revisión de código / ⏳ visual |
| Temporizador gráfico 30 → 0 que regenera el código | ✅ ⏳ | `M/components/CountdownBar.tsx`, `M/authenticator/useTotpCode.ts` (precálculo de T+1, `useNativeDriver`, `AppState`) | ⏳ visual |
| 100 % offline (Modo Avión) | ✅ ⏳ | `useTotpCode` y `totpCore` no importan ningún cliente HTTP; tiempo de `Date.now()` | Revisión de imports; ⏳ Modo Avión real |

## Punto 4 — Step-up y anti-replay

| Requisito | Estado | Dónde | Verificación |
|---|---|---|---|
| `GET /api/boveda-critica` con access estándar → 403 `mfa_required` + `step_up_token` | ✅ | `B/routes/api.ts` · `boveda` | T-B, S 05 |
| `POST /auth/mfa/verify` valida step_up + código | ✅ | `B/routes/session.ts` | T-B "step_up_token inválido → 401", "formato inválido → 400" |
| Ventanas C-1, C, C+1 | ✅ | `B/lib/totp.ts` · `verifyTotp` (comparación en tiempo constante de las 3) | T-B "acepta C-1 y C+1, rechaza C+2" |
| Caché anti-replay TTL 90 s → 409 Replay Attack Detected | ✅ | `B/stores/replayCache.ts`, `B/routes/session.ts` | T-B "…mismo código 409", "el caché expira a los 90 s"; S 08 |
| `elevated_token` con `mfa_verified: true`, 10 min | ✅ | `B/routes/session.ts`, `B/lib/jwt.ts` | T-B (`expires_in` 600, vence a los 601 s) |
| App: la pantalla captura el 403 y abre el modal 2FA | ✅ ⏳ | `M/app/(app)/(tabs)/boveda.tsx` · `requestVault`, `M/components/StepUpModal.tsx` | T-M "403 mfa_required NO dispara refresh"; ⏳ flujo visual |
| Demo de replay desde la app | ✅ ⏳ | `boveda.tsx` · `replayLastCode`, `M/auth/stepUpMemory.ts` | ⏳ botón "Reenviar último código usado" |
| Rate limit 5 fallos/min → 429 | ✅ | `B/stores/failureRateLimiter.ts` | T-B "5 fallos en un minuto → 429" |

## Pruebas de aceptación (sustentación)

| # | Escenario | Estado | Cómo probarlo (pasos exactos en README §5) |
|---|---|---|---|
| 1 | OAuth + PKCE con navegador del sistema | ✅ backend (S) · ⏳ teléfono | Iniciar sesión → se abre el navegador del sistema (barra de URL visible) → credenciales → vuelve sola a la app → Laboratorio: "refresh_token en SecureStore: Sí", log "state verificado"; consola: `[PKCE] ok` |
| 2 | Paridad TOTP con Google Authenticator | ✅ algoritmo (vectores RFC + paridad app↔backend) · ⏳ teléfono | Escanear el QR de `/mfa/enroll` en la app y en Google Authenticator; comparar los 6 dígitos durante 2–3 ventanas. Opcional: Laboratorio → self-tests 19/19 |
| 3 | Cálculo offline en Modo Avión | ⏳ | Modo Avión + Wi-Fi apagado, pestaña Authenticator, esperar a que la barra llegue a 0: el código nuevo aparece sin error ni parpadeo |
| 4 | Step-up y Bóveda | ✅ backend (S 05–07) · ⏳ teléfono | Pestaña Bóveda → modal 2FA → "Usar mi Authenticator integrado" → Verificar → datos sensibles; consola: `[BOVEDA] 403` y luego `200` |
| 5 | Anti-replay (409) | ✅ backend (S 08, T-B) · ⏳ teléfono | Justo después del paso 4: "Reenviar último código usado" → tarjeta "Ataque bloqueado · 409 Conflict: Replay Attack Detected" |

## Entregables

| Entregable | Estado | Dónde |
|---|---|---|
| `/mobile-app` (React Native / Expo) | ✅ | `mobile-app/` (Expo SDK 58, `expo-doctor` 20/20) |
| `/backend-auth` (Express) | ✅ | `backend-auth/` |
| README paso a paso (backend, variables, app) | ✅ | `README.md` §1–4, troubleshooting §7, decisiones §8, limitaciones §9 |
| Guion de sustentación + guion de video | ✅ | `README.md` §5 |
| Video de 60–90 s (opcional) | ⏳ | Lo graba la estudiante siguiendo el guion |
| Explicación y diagramas | ✅ | `docs/EXPLICACION.md` (3 diagramas mermaid, 15 preguntas) |
| Repositorio Git con commits convencionales | ✅ | `git log` (sin push) |

## Rúbrica

| Criterio (peso) | Estado | Justificación |
|---|---|---|
| TOTP RFC 6238 (25 %) | ✅ ⏳ | Desde cero (HMAC + truncamiento), 16 vectores RFC + paridad cruzada; Modo Avión y Google Authenticator: ⏳ manual |
| OAuth 2.0 + PKCE + deep linking (25 %) | ✅ ⏳ | Verifier/challenge válidos (vector RFC), navegador del sistema, deep link, `state` validado y de un solo uso, sin `client_secret`; retorno real: ⏳ manual |
| Almacenamiento seguro + Silent Refresh Queue (20 %) | ✅ | access en RAM, refresh en SecureStore, cola de promesas probada contra el backend real (5 → 1 refresh) y expiración que lleva a Bienvenida |
| Step-up + anti-replay (15 %) | ✅ | 403 sin MFA, elevación tras 2FA, 409 en replay, 429 por fuerza bruta, `step_up_token` nunca da acceso |
| UI/UX y código limpio (15 %) | ✅ ⏳ | Contador animado en el hilo nativo, sin parpadeo, teclado numérico `oneTimeCode`, errores descriptivos en español, tema claro/oscuro, módulos separados, TS estricto, ESLint + Prettier sin hallazgos; pulido visual: ⏳ revisar en el teléfono |

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

**Pruebas manuales que te corresponden (⏳):** (1) login con el navegador del sistema y retorno por deep link en Expo Go; (2) escanear el QR de `/mfa/enroll` con la app y con Google Authenticator y comparar códigos; (3) Modo Avión y esperar el cambio de 30 → 0; (4) Bóveda → 403 → modal → código → datos; (5) "Reenviar último código usado" → 409; además: Laboratorio → 5 peticiones concurrentes (un solo refresh), "Simular refresh_token revocado" (vuelve a Bienvenida), self-tests 19/19 en el teléfono, y un vistazo general a la UI en modo claro y oscuro.
