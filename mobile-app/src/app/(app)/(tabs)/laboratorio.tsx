import { useFocusEffect } from 'expo-router';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { Alert } from 'react-native';

import { fetchProfile, revokeRefreshToken } from '@/api/endpoints';
import { describeError } from '@/api/errors';
import { logSecurityEvent, securityLog } from '@/api/securityLog';
import { getRedirectUri } from '@/auth/oauthFlow';
import { maskToken, tokenStore } from '@/auth/tokenStore';
import { SecurityLogList } from '@/components/SecurityLogList';
import { SelfTestPanel } from '@/components/SelfTestPanel';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { Screen } from '@/components/ui/Screen';
import { API_URL } from '@/config/env';
import { refreshTokenStorage } from '@/storage/secureStorage';

const CONCURRENT_REQUESTS = 5;

export default function SecurityLabScreen() {
  const tokens = useSyncExternalStore(tokenStore.subscribe, tokenStore.getSnapshot);
  const [refreshPreview, setRefreshPreview] = useState<string | null>(null);
  const [burstResult, setBurstResult] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [bursting, setBursting] = useState(false);

  const readSecureStore = useCallback(async () => {
    setRefreshPreview(maskToken(await refreshTokenStorage.get().catch(() => null)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void readSecureStore();
    }, [readSecureStore]),
  );

  const invalidateAccessToken = () => {
    tokenStore.invalidateAccessToken();
    logSecurityEvent('warn', 'access_token invalidado en memoria (simula expiración)');
  };

  /** 5 peticiones a la vez: con el token inválido deben producir UN solo POST /auth/refresh. */
  const fireConcurrentRequests = async () => {
    setBursting(true);
    setBurstResult(null);
    logSecurityEvent('info', `Disparando ${CONCURRENT_REQUESTS} peticiones concurrentes a GET /api/me`);
    const results = await Promise.allSettled(Array.from({ length: CONCURRENT_REQUESTS }, () => fetchProfile()));
    const ok = results.filter((result) => result.status === 'fulfilled').length;
    const firstError = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    setBurstResult(
      ok === CONCURRENT_REQUESTS
        ? {
            tone: 'success',
            message: `${ok}/${CONCURRENT_REQUESTS} respuestas 200. Revisa el registro: un solo "POST /auth/refresh iniciado".`,
          }
        : { tone: 'danger', message: `${ok}/${CONCURRENT_REQUESTS} OK. ${firstError ? describeError(firstError.reason) : ''}` },
    );
    setBursting(false);
    void readSecureStore();
  };

  const simulateRevokedRefresh = () => {
    Alert.alert(
      'Simular refresh_token revocado',
      'Se revocará el refresh_token en el servidor y se invalidará el access_token. La siguiente petición no podrá renovarse y la app volverá a la bienvenida.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Simular',
          style: 'destructive',
          onPress: async () => {
            const refreshToken = await refreshTokenStorage.get();
            if (refreshToken) await revokeRefreshToken(refreshToken).catch(() => undefined);
            logSecurityEvent('warn', 'refresh_token revocado en el servidor (simulación)');
            tokenStore.invalidateAccessToken();
            await fetchProfile().catch(() => undefined); // 401 → refresh 401 → sesión expirada → bienvenida
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Card title="Estado de la sesión" subtitle="Valores enmascarados: nunca se muestra un token completo.">
        <InfoRow
          label="access_token en RAM"
          value={tokens.hasAccessToken ? `Sí · ${tokens.accessTokenPreview}` : 'No'}
          mono
          tone={tokens.hasAccessToken ? 'success' : 'danger'}
        />
        <InfoRow
          label="refresh_token en SecureStore"
          value={refreshPreview ? `Sí · ${refreshPreview}` : 'No'}
          mono
          tone={refreshPreview ? 'success' : 'danger'}
        />
        <InfoRow
          label="Token elevado (2FA) en RAM"
          value={tokens.elevatedExpiresAtMs ? `Sí · vence ${new Date(tokens.elevatedExpiresAtMs).toLocaleTimeString()}` : 'No'}
          mono
        />
        <InfoRow label="redirect_uri efectivo" value={getRedirectUri()} mono />
        <InfoRow label="Backend" value={API_URL || 'sin configurar'} mono />
        <AppButton label="Releer SecureStore" icon="refresh" variant="ghost" onPress={() => void readSecureStore()} />
      </Card>

      <Card
        title="Silent refresh con cola"
        subtitle="1) Invalida el access_token. 2) Dispara 5 peticiones a la vez. Debe verse UN solo POST /auth/refresh y 5 reintentos OK.">
        <AppButton
          label="Invalidar access token en memoria"
          icon="close-circle-outline"
          variant="secondary"
          onPress={invalidateAccessToken}
        />
        <AppButton
          label={`Disparar ${CONCURRENT_REQUESTS} peticiones concurrentes a /api/me`}
          icon="flash-outline"
          onPress={() => void fireConcurrentRequests()}
          loading={bursting}
        />
        {burstResult ? <Banner tone={burstResult.tone} message={burstResult.message} /> : null}
        <AppButton label="Simular refresh_token revocado" icon="skull-outline" variant="danger" onPress={simulateRevokedRefresh} />
      </Card>

      <Card title="Self-tests criptográficos" subtitle="RFC 2202 (HMAC-SHA1), RFC 4226 (HOTP), RFC 6238 (TOTP) y RFC 7636 (PKCE).">
        <SelfTestPanel />
      </Card>

      <Card title="Registro de eventos de seguridad">
        <AppButton label="Limpiar registro" icon="trash-outline" variant="ghost" onPress={securityLog.clear} />
        <SecurityLogList />
      </Card>
    </Screen>
  );
}
