import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeError, OAuthFlowError } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { API_URL, IS_API_CONFIGURED } from '@/config/env';
import { radius, spacing, useAppTheme } from '@/theme/theme';

const FEATURES = [
  { icon: 'globe-outline', text: 'Login en el navegador del sistema con OAuth 2.0 + PKCE (sin WebView).' },
  { icon: 'key-outline', text: 'refresh_token en Keychain / Keystore; access_token solo en memoria.' },
  { icon: 'timer-outline', text: 'Authenticator TOTP propio (RFC 6238) que funciona en Modo Avión.' },
  { icon: 'shield-checkmark-outline', text: 'Bóveda con step-up 2FA y protección anti-replay.' },
] as const;

export default function WelcomeScreen() {
  const { signIn, notice, clearNotice } = useAuth();
  const { colors } = useAppTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; tone: 'warning' | 'danger' } | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    clearNotice();
    try {
      await signIn();
    } catch (err) {
      // Cancelar no es un error grave: se muestra como aviso.
      const cancelled = err instanceof OAuthFlowError && err.kind === 'cancelled';
      setError({ message: describeError(err), tone: cancelled ? 'warning' : 'danger' });
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <View style={[styles.logo, { backgroundColor: colors.infoBg }]}>
          <Ionicons name="shield-half" size={44} color={colors.primary} />
        </View>
        <Text style={[styles.kicker, { color: colors.primary }]}>UNIVERSIDAD DE LA SABANA · SESIÓN 14</Text>
        <Text style={[styles.title, { color: colors.text }]}>Seguridad Móvil</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>OAuth 2.0 con PKCE, almacenamiento cifrado y step-up 2FA.</Text>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.icon} style={styles.feature}>
              <Ionicons name={feature.icon} size={20} color={colors.primary} />
              <Text style={[styles.featureText, { color: colors.text }]}>{feature.text}</Text>
            </View>
          ))}
        </View>

        {notice ? <Banner tone="warning" title="Sesión finalizada" message={notice} /> : null}
        {error ? <Banner tone={error.tone} message={error.message} /> : null}
        {!IS_API_CONFIGURED ? (
          <Banner
            tone="danger"
            title="Falta configuración"
            message="Define EXPO_PUBLIC_API_URL en mobile-app/.env con la IP LAN del backend y reinicia Metro."
          />
        ) : null}

        <View style={styles.actions}>
          <AppButton
            label="Iniciar sesión"
            icon="log-in-outline"
            onPress={handleSignIn}
            loading={loading}
            disabled={!IS_API_CONFIGURED}
            accessibilityHint="Abre el navegador del sistema para autenticarte"
          />
          <Text style={[styles.footnote, { color: colors.textMuted }]}>
            Se abrirá el navegador seguro del sistema. Tu contraseña nunca pasa por la app.
          </Text>
          <Text style={[styles.footnote, { color: colors.textMuted }]}>Servidor: {API_URL || 'sin configurar'}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: 'center', maxWidth: 520, width: '100%', alignSelf: 'center' },
  logo: { width: 80, height: 80, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  title: { fontSize: 30, fontWeight: '800', marginTop: -spacing.sm },
  subtitle: { fontSize: 16, lineHeight: 22, marginTop: -spacing.sm },
  features: { gap: spacing.md },
  feature: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  featureText: { flex: 1, fontSize: 15, lineHeight: 21 },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  footnote: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
