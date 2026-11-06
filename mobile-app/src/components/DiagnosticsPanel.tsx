import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { startupDiagnostics } from '../auth/startupDiagnostics';
import { monoFont, radius, spacing, useAppTheme } from '../theme/theme';

/** Panel de diagnóstico del arranque y del retorno del login. Solo se renderiza en desarrollo. */
export function DiagnosticsPanel() {
  const { colors } = useAppTheme();
  const entries = useSyncExternalStore(startupDiagnostics.subscribe, startupDiagnostics.getSnapshot);
  if (!__DEV__ || entries.length === 0) return null;
  return (
    <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
      <Text style={[styles.title, { color: colors.textMuted }]}>Diagnóstico (solo desarrollo)</Text>
      {entries.map((entry, index) => (
        <Text key={`${index}-${entry}`} selectable style={[styles.line, { color: colors.text }]}>
          {entry}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, gap: 4 },
  title: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  line: { fontFamily: monoFont, fontSize: 11, lineHeight: 15 },
});
