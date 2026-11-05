import { Animated, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useAppTheme } from '../theme/theme';

/**
 * Barra regresiva de 30 → 0 s. El ancho se anima con scaleX en el hilo nativo (sin re-render por
 * frame); el color cambia en los últimos 5 segundos.
 */
export function CountdownBar({ progress, secondsRemaining }: { progress: Animated.Value; secondsRemaining: number }) {
  const { colors } = useAppTheme();
  const ending = secondsRemaining <= 5;
  const color = ending ? colors.danger : colors.primary;

  return (
    <View style={styles.wrapper} accessibilityRole="progressbar" accessibilityLabel={`Quedan ${secondsRemaining} segundos`}>
      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        <Animated.View style={[styles.fill, { backgroundColor: color, transform: [{ scaleX: progress }] }]} />
      </View>
      <Text style={[styles.label, { color: ending ? colors.danger : colors.textMuted }]}>
        {ending ? `¡Cambia en ${secondsRemaining} s!` : `Cambia en ${secondsRemaining} s`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  track: { height: 10, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', width: '100%', borderRadius: radius.pill, transformOrigin: 'left' },
  label: { fontSize: 14, fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums'] },
});
