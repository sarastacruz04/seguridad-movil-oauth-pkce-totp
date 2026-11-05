# CLAUDE.md — Laboratorio Seguridad Móvil (OAuth 2.0 + PKCE, SecureStore, Step-Up 2FA TOTP)

Universidad de La Sabana · Desarrollo Móvil · Sesión 14. Prueba de concepto académica con sustentación en vivo (5 min, 5 escenarios) y rúbrica.
Prioridades: (1) correctitud criptográfica, (2) cada requisito demostrable, (3) código modular, legible y con tipado estricto.

## §0. Reglas inviolables

- **R1.** PROHIBIDO usar librerías de alto nivel de TOTP (otplib, speakeasy, otpauth, etc.) en app y backend. Solo hashing nativo (expo-crypto / node:crypto). Base32 implementado a mano.
- **R2.** PROHIBIDO expo-auth-session o cualquier librería OAuth/PKCE "caja negra". PKCE, state y flujo a mano.
- **R3.** PROHIBIDO WebView embebida (no instalar react-native-webview). Login SOLO con `WebBrowser.openAuthSessionAsync` (expo-web-browser).
- **R4.** La app es cliente público: NUNCA un `client_secret` en el código móvil ni en variables `EXPO_PUBLIC_*`.
- **R5.** `access_token` SOLO en memoria. `refresh_token` y semilla TOTP SOLO en expo-secure-store. Prohibido AsyncStorage, MMKV sin cifrar, localStorage o archivos para secretos.
- **R6.** TypeScript estricto en app y backend (`"strict": true`), sin `any` implícito, sin `@ts-ignore`, sin enums mágicos sin tipar; errores con clases tipadas.
- **R7.** Cálculo TOTP en el dispositivo 100% offline (cero peticiones de red).
- **R8.** No inventar APIs: revisar tipos en `node_modules` y/o docs.expo.dev (SDK 58; el Router cambió en SDK 58) antes de usar expo-crypto, expo-secure-store, expo-camera, expo-web-browser, expo-linking, expo-router. Si algo no funciona en Expo Go, avisar en lugar de esquivarlo.
- **R9.** Sin infraestructura externa (sin Docker, Prefect, clústeres ni BD externas): backend en memoria.

Además: nunca registrar tokens completos en consola (enmascarar a 6 caracteres); errores del backend siempre `{error, message}`.

## §1. Entorno, estructura y Git

- Node: SDK 58 requiere Node 22.13+ / 24.3+ / 26. Node vive en WSL (Ubuntu); ejecutar comandos de Node/npm/git desde WSL.
- Estructura (monorepo simple, un solo repo Git):
  ```
  /mobile-app     → app Expo (React Native, TypeScript, Expo Router), SDK 58, corre en Expo Go
  /backend-auth   → Node.js + Express + TypeScript, en memoria, escucha 0.0.0.0:3000
  /docs           → EXPLICACION.md y diagramas mermaid
  README.md, CLAUDE.md, CHECKLIST.md, .gitignore (node_modules, .env, .expo, dist)
  ```
- App (`mobile-app/src`): `config/`, `lib/crypto/`, `lib/pkce/`, `lib/totp/`, `storage/`, `api/`, `auth/`, `components/`. Rutas: `(auth)/welcome`; `(app)/(tabs)`: authenticator, boveda, laboratorio, perfil.
- app.json: `"scheme": "unisabana-auth"`, permiso de cámara en español, sin secretos.
- Config: `mobile-app/.env.example` con `EXPO_PUBLIC_API_URL=http://<IP-LAN>:3000` (emulador Android: 10.0.2.2). `backend-auth/.env.example` con TOTP_SECRET, JWT_SECRET, DEMO_PASSWORD, TTLs, DEV_ENROLL_PAGE.
- Git: commits convencionales (feat:, test:, docs:, chore:) al cerrar cada fase. **No hacer push.**

## Forma de trabajo

Fases: F0 setup → F1 backend + tests + smoke → F2 libs app (crypto, base64url, HMAC, TOTP, PKCE) + tests → F3 OAuth+PKCE app → F4 SecureStore + cliente HTTP + cola refresh + laboratorio → F5 Authenticator (QR, manual, timer) → F6 Step-Up + Bóveda + demo replay → F7 pulido UI/UX → F8 README + docs → F9 auto-auditoría (CHECKLIST.md).
Al cerrar cada fase: `npx tsc --noEmit`, tests y commit. Ambigüedades → elegir lo razonable y documentarlo en README → "Decisiones". Lo no verificable aquí (cámara, Modo Avión, paridad con Google Authenticator, navegador del sistema) → "PENDIENTE DE PRUEBA MANUAL" en CHECKLIST.md.
