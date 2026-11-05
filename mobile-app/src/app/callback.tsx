import { Redirect } from 'expo-router';

/**
 * Destino del deep link de OAuth (…/callback?code=…&state=…). El code y el state los procesa
 * oauthFlow a partir del resultado de openAuthSessionAsync; en Android el router también recibe
 * el enlace, así que esta ruta existe solo para no mostrar "ruta no encontrada" y volver al inicio.
 * Aquí no se lee ni se registra ningún parámetro.
 */
export default function OAuthCallback() {
  return <Redirect href="/" />;
}
