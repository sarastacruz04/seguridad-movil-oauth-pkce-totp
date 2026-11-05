import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { securityLog, type SecurityEventLevel } from '../api/securityLog';
import { monoFont, spacing, useAppTheme } from '../theme/theme';

const SYMBOLS: Record<SecurityEventLevel, string> = { info: '•', warn: '!', success: '✓', error: '✕' };

function formatTime(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Visor del registro de eventos de seguridad (más reciente arriba). */
export function SecurityLogList() {
  const { colors } = useAppTheme();
  const events = useSyncExternalStore(securityLog.subscribe, securityLog.getSnapshot);
  const levelColor: Record<SecurityEventLevel, string> = {
    info: colors.textMuted,
    warn: colors.warning,
    success: colors.success,
    error: colors.danger,
  };

  if (events.length === 0) {
    return <Text style={[styles.empty, { color: colors.textMuted }]}>Sin eventos todavía. Ejecuta una de las pruebas de arriba.</Text>;
  }
  return (
    <View style={styles.list}>
      {events.map((event) => (
        <View key={event.id} style={styles.row}>
          <Text style={[styles.time, { color: colors.textMuted }]}>{formatTime(event.atMs)}</Text>
          <Text style={[styles.message, { color: levelColor[event.level] }]}>
            {SYMBOLS[event.level]} {event.message}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { gap: 1 },
  time: { fontFamily: monoFont, fontSize: 11 },
  message: { fontSize: 13, lineHeight: 18 },
  empty: { fontSize: 14, fontStyle: 'italic' },
});
