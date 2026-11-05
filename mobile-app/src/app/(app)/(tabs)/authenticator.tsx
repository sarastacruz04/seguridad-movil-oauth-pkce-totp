import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { totpAccountStore, useTotpAccount } from '@/authenticator/totpAccountStore';
import { useTotpCode } from '@/authenticator/useTotpCode';
import { CodeDisplay } from '@/components/CodeDisplay';
import { CountdownBar } from '@/components/CountdownBar';
import { ManualSecretForm } from '@/components/ManualSecretForm';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { API_URL } from '@/config/env';
import type { TotpAccount } from '@/lib/totp';
import { spacing, useAppTheme } from '@/theme/theme';

export default function AuthenticatorScreen() {
  const accountState = useTotpAccount();

  if (accountState.status === 'loading') {
    return (
      <Screen>
        <ActivityIndicator style={styles.loader} />
      </Screen>
    );
  }
  return accountState.account ? <LiveCode account={accountState.account} /> : <Enrollment />;
}

/** Sin semilla guardada: ingesta por QR (opción A) o manual (opción B). */
function Enrollment() {
  const router = useRouter();
  return (
    <Screen>
      <Banner
        tone="info"
        title="Enrola tu autenticador"
        message={`Abre ${API_URL || 'http://<IP-del-backend>:3000'}/mfa/enroll en tu PC para ver el QR de la semilla (solo desarrollo).`}
      />
      <Card
        title="Opción A · Escanear código QR"
        subtitle="Usa la cámara para leer el URI otpauth://totp/… Es el mismo QR que escaneas en Google Authenticator.">
        <AppButton label="Escanear QR" icon="qr-code-outline" onPress={() => router.push('/scan')} />
      </Card>
      <Card title="Opción B · Pegar la semilla" subtitle="Para emuladores sin cámara. La semilla se guarda cifrada en Keychain / Keystore.">
        <ManualSecretForm onSubmit={totpAccountStore.save} />
      </Card>
    </Screen>
  );
}

function LiveCode({ account }: { account: TotpAccount }) {
  const { colors } = useAppTheme();
  const { code, secondsRemaining, progress, error } = useTotpCode(account.secret);

  const confirmDelete = () => {
    Alert.alert('Eliminar semilla', 'Se borrará del almacenamiento seguro y dejarás de generar códigos. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void totpAccountStore.remove() },
    ]);
  };

  return (
    <Screen>
      <Card>
        <View style={styles.header}>
          <Text style={[styles.issuer, { color: colors.primary }]}>{account.issuer}</Text>
          <Text style={[styles.account, { color: colors.textMuted }]} numberOfLines={1}>
            {account.accountName}
          </Text>
        </View>
        {error ? <Banner tone="danger" message={error} /> : <CodeDisplay code={code} emphasize={secondsRemaining <= 5} />}
        <CountdownBar progress={progress} secondsRemaining={secondsRemaining} />
      </Card>

      <Banner
        tone="success"
        title="Calculado en este dispositivo"
        message="HMAC-SHA1 + truncamiento dinámico (RFC 6238) con el reloj del teléfono. No usa la red: funciona en Modo Avión."
      />
      <Text style={[styles.note, { color: colors.textMuted }]}>
        Debe coincidir con Google Authenticator para la misma semilla. Si no coincide, revisa que la hora del teléfono sea automática.
      </Text>

      <AppButton label="Eliminar semilla" icon="trash-outline" variant="danger" onPress={confirmDelete} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxl },
  header: { alignItems: 'center', gap: 2 },
  issuer: { fontSize: 18, fontWeight: '800' },
  account: { fontSize: 14 },
  note: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
