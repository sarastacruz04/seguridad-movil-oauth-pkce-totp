import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { normalizeBase32, validateBase32Secret } from '../lib/totp';
import type { TotpAccount } from '../lib/totp/types';
import { monoFont, radius, spacing, useAppTheme } from '../theme/theme';
import { AppButton } from './ui/AppButton';

/** Opción B: pegar la semilla Base32 a mano (indispensable en emuladores sin cámara). */
export function ManualSecretForm({ onSubmit }: { onSubmit: (account: TotpAccount) => Promise<void> }) {
  const { colors } = useAppTheme();
  const [secret, setSecret] = useState('');
  const [account, setAccount] = useState('estudiante@unisabana.edu.co');
  const [saving, setSaving] = useState(false);

  const error = secret.length > 0 ? validateBase32Secret(secret) : null;
  const canSave = secret.length > 0 && error === null;

  const save = async () => {
    setSaving(true);
    try {
      await onSubmit({ secret: normalizeBase32(secret), issuer: 'UniSabana', accountName: account.trim() || 'Cuenta manual' });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }];
  return (
    <View style={styles.form}>
      <Text style={[styles.label, { color: colors.textMuted }]}>Semilla Base32</Text>
      <TextInput
        value={secret}
        onChangeText={setSecret}
        placeholder="JBSW Y3DP EHPK 3PXP"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        importantForAutofill="no"
        style={[inputStyle, styles.mono, error ? { borderColor: colors.danger } : null]}
        accessibilityLabel="Semilla Base32"
      />
      {error ? (
        <Text style={[styles.hint, { color: colors.danger }]}>{error}</Text>
      ) : canSave ? (
        <Text style={[styles.hint, { color: colors.success }]}>Semilla válida ({normalizeBase32(secret).length} caracteres)</Text>
      ) : (
        <Text style={[styles.hint, { color: colors.textMuted }]}>Solo letras A–Z y dígitos 2–7; los espacios se ignoran.</Text>
      )}

      <Text style={[styles.label, { color: colors.textMuted }]}>Cuenta (opcional)</Text>
      <TextInput
        value={account}
        onChangeText={setAccount}
        autoCapitalize="none"
        autoCorrect={false}
        style={inputStyle}
        accessibilityLabel="Nombre de la cuenta"
      />

      <AppButton label="Guardar semilla" icon="save-outline" onPress={save} disabled={!canSave} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16 },
  mono: { fontFamily: monoFont, letterSpacing: 1 },
  hint: { fontSize: 13, marginBottom: spacing.sm },
});
