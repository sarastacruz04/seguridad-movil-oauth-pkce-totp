/**
 * Variables públicas de la app. Todo lo que empieza por EXPO_PUBLIC_ queda embebido en el bundle
 * y es visible para cualquiera: por eso aquí NUNCA hay secretos (la app es un cliente público).
 * Expo solo sustituye accesos estáticos (process.env.EXPO_PUBLIC_X), no dinámicos.
 */
const rawApiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';

export const API_URL = rawApiUrl.trim().replace(/\/+$/, '');
export const IS_API_CONFIGURED = /^https?:\/\/[^\s/]+/.test(API_URL);
