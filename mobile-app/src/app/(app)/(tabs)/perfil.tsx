import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl } from 'react-native';

import { fetchProfile } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import type { Profile } from '@/api/responses';
import { useAuth } from '@/auth/AuthProvider';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { Screen } from '@/components/ui/Screen';

export default function ProfileScreen() {
  const { signOut, startedOffline } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  /** GET /api/me pasa por el interceptor: si el access_token venció se renueva en silencio. */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProfile(await fetchProfile());
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const confirmSignOut = () => {
    Alert.alert('Cerrar sesión', 'Se revocará el refresh_token en el servidor y se borrará del almacenamiento seguro.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await signOut();
        },
      },
    ]);
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading && profile !== null} onRefresh={() => void load()} />}>
      {startedOffline ? (
        <Banner tone="warning" message="La app arrancó sin conexión: la sesión se conservó y se renovará cuando vuelva la red." />
      ) : null}
      {loading && !profile ? <ActivityIndicator /> : null}
      {error ? <Banner tone="danger" message={error} /> : null}
      {profile ? (
        <Card title={profile.name} subtitle="Datos de GET /api/me (recurso protegido estándar)">
          <InfoRow label="Correo" value={profile.email} />
          <InfoRow label="ID de usuario" value={profile.id} mono />
          <InfoRow label="mfa_verified del access_token" value={profile.mfaVerified ? 'true' : 'false'} mono />
          <InfoRow label="access_token vence" value={new Date(profile.tokenExpiresAt * 1000).toLocaleTimeString()} />
        </Card>
      ) : null}
      <Card title="Cómo se guarda tu sesión">
        <InfoRow label="access_token" value="Solo en memoria (5 min). Se pierde al cerrar la app." />
        <InfoRow label="refresh_token" value="Keychain / Keystore vía expo-secure-store (30 días)." />
        <InfoRow label="Semilla TOTP" value="Keychain / Keystore; nunca sale del dispositivo." />
      </Card>
      <AppButton label="Cerrar sesión" icon="log-out-outline" variant="danger" onPress={confirmSignOut} loading={signingOut} />
    </Screen>
  );
}
