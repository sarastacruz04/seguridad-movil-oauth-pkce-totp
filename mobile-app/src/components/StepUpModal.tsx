import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { verifyMfaCode } from '../api/endpoints';
import { ApiError, describeError, NetworkError } from '../api/errors';
import { logSecurityEvent } from '../api/securityLog';
import { totpAccountStore } from '../authenticator/totpAccountStore';
import { generateTotp } from '../lib/totp';
import { monoFont, radius, spacing, useAppTheme } from '../theme/theme';
import { AppButton } from './ui/AppButton';
import { Banner } from './ui/Banner';

/** Mensajes específicos por respuesta del backend en POST /auth/mfa/verify. */
export function describeMfaError(error: unknown): string {
  if (error instanceof NetworkError) return 'Sin conexión con el servidor.';
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Código ya utilizado (ataque de repetición bloqueado).';
    if (error.status === 429) return 'Demasiados intentos, espera un minuto.';
    if (error.status === 401) return 'La solicitud de verificación expiró. Cierra y vuelve a abrir la bóveda.';
    if (error.code === 'invalid_format') return 'El código debe tener exactamente 6 dígitos.';
    if (error.status === 400) return 'Código incorrecto o expirado.';
  }
  return describeError(error);
}

interface StepUpModalProps {
  readonly stepUpToken: string | null;
  readonly onVerified: (result: { elevatedToken: string; expiresIn: number; code: string }) => void;
  readonly onCancel: () => void;
}

export function StepUpModal({ stepUpToken, onVerified, onCancel }: StepUpModalProps) {
  return (
    <Modal visible={stepUpToken !== null} animationType="slide" transparent onRequestClose={onCancel}>
      {/* key: cada nuevo desafío (step_up_token) monta un formulario limpio. */}
      {stepUpToken ? <StepUpForm key={stepUpToken} stepUpToken={stepUpToken} onVerified={onVerified} onCancel={onCancel} /> : null}
    </Modal>
  );
}

function StepUpForm({ stepUpToken, onVerified, onCancel }: StepUpModalProps & { readonly stepUpToken: string }) {
  const { colors } = useAppTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const hasSeed = totpAccountStore.current() !== null;

  const fillFromAuthenticator = async () => {
    const account = totpAccountStore.current();
    if (!account) return;
    setCode(await generateTotp(account.secret, Date.now() / 1000)); // cálculo local, sin red
    setError(null);
  };

  const verify = async () => {
    setVerifying(true);
    setError(null);
    try {
      const result = await verifyMfaCode(stepUpToken, code);
      logSecurityEvent('success', `2FA verificado → elevated_token ${result.elevatedToken.slice(0, 6)}… (${result.expiresIn}s, solo RAM)`);
      onVerified({ ...result, code });
    } catch (err) {
      const message = describeMfaError(err);
      logSecurityEvent(err instanceof ApiError && err.status === 409 ? 'warn' : 'error', `2FA rechazado: ${message}`);
      setError(message);
      setVerifying(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={28} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>Verificación en dos pasos</Text>
          <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          El servidor respondió 403 mfa_required. Ingresa el código de 6 dígitos de tu autenticador para elevar tu sesión.
        </Text>

        <TextInput
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={6}
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          placeholderTextColor={colors.border}
          style={[
            styles.input,
            { color: colors.text, borderColor: error ? colors.danger : colors.border, backgroundColor: colors.background },
          ]}
          accessibilityLabel="Código de verificación de 6 dígitos"
          onSubmitEditing={() => code.length === 6 && void verify()}
        />

        {error ? <Banner tone="danger" message={error} /> : null}

        <AppButton
          label="Usar mi Authenticator integrado"
          icon="keypad-outline"
          variant="secondary"
          onPress={() => void fillFromAuthenticator()}
          disabled={!hasSeed || verifying}
        />
        {!hasSeed ? (
          <Text style={[styles.hint, { color: colors.textMuted }]}>Enrola una semilla en la pestaña Authenticator para autocompletar.</Text>
        ) : null}
        <AppButton
          label="Verificar"
          icon="checkmark-circle-outline"
          onPress={() => void verify()}
          loading={verifying}
          disabled={code.length !== 6}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    padding: spacing.xl,
    gap: spacing.md,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.xxl,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: 19, fontWeight: '800' },
  text: { fontSize: 14, lineHeight: 20 },
  input: {
    fontFamily: monoFont,
    fontSize: 36,
    letterSpacing: 10,
    textAlign: 'center',
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  hint: { fontSize: 13, textAlign: 'center' },
});
