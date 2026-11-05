import { StyleSheet, Text, View } from 'react-native';

import { monoFont, spacing, useAppTheme } from '../../theme/theme';

/** Fila etiqueta / valor. Con `mono` el valor usa tipografía monoespaciada (tokens enmascarados, URIs). */
export function InfoRow({
  label,
  value,
  mono = false,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'success' | 'danger';
}) {
  const { colors } = useAppTheme();
  const valueColor = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : colors.text;
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <Text selectable style={[styles.value, { color: valueColor }, mono && { fontFamily: monoFont, fontSize: 13 }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  value: { fontSize: 15, marginTop: spacing.xs / 2 },
});
