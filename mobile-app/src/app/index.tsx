import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/AuthProvider';

/** Punto de entrada: envía a la app o a la bienvenida según el estado de sesión. */
export default function Index() {
  const { status } = useAuth();
  return <Redirect href={status === 'signedIn' ? '/authenticator' : '/welcome'} />;
}
