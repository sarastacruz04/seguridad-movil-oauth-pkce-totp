import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useAppTheme } from '../../theme/theme';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const ICONS = {
  info: 'information-circle',
  success: 'checkmark-circle',
  warning: 'warning',
  danger: 'alert-circle',
} as const;

export function Banner({ tone, title, message }: { tone: BannerTone; title?: string; message: string }) {
  const { colors } = useAppTheme();
  const tones: Record<BannerTone, { fg: string; bg: string }> = {
    info: { fg: colors.info, bg: colors.infoBg },
    success: { fg: colors.success, bg: colors.successBg },
    warning: { fg: colors.warning, bg: colors.warningBg },
    danger: { fg: colors.danger, bg: colors.dangerBg },
  };
  const { fg, bg } = tones[tone];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Ionicons name={ICONS[tone]} size={20} color={fg} />
      <View style={styles.texts}>
        {title ? <Text style={[styles.title, { color: fg }]}>{title}</Text> : null}
        <Text style={[styles.message, { color: fg }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, alignItems: 'flex-start' },
  texts: { flex: 1, gap: 2 },
  title: { fontWeight: '700', fontSize: 15 },
  message: { fontSize: 14, lineHeight: 20 },
});
