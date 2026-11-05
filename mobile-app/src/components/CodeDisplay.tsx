import { StyleSheet, Text, View } from 'react-native';

import { monoFont, useAppTheme } from '../theme/theme';

/** "054231" → "054 231" (solo visual; el valor real sigue siendo de 6 dígitos). */
export function groupCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/**
 * Código TOTP grande y monoespaciado. Mientras se calcula el primer código se reserva el mismo
 * espacio sin texto (sin "------" ni saltos de layout).
 */
export function CodeDisplay({ code, emphasize }: { code: string | null; emphasize: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.box} accessible accessibilityLabel={code ? `Código ${code.split('').join(' ')}` : 'Calculando código'}>
      <Text
        selectable
        style={[styles.code, { color: emphasize ? colors.danger : colors.text, opacity: code ? 1 : 0 }]}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {code ? groupCode(code) : '000 000'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', minHeight: 72 },
  code: { fontFamily: monoFont, fontSize: 52, fontWeight: '700', letterSpacing: 4, fontVariant: ['tabular-nums'] },
});
