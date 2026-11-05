import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useAppTheme } from '../../theme/theme';

interface CardProps extends PropsWithChildren {
  readonly title?: string;
  readonly subtitle?: string;
}

export function Card({ title, subtitle, children }: CardProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {title ? <Text style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
      {subtitle ? <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: -spacing.xs },
});
