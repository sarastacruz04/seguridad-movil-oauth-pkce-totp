import type { PropsWithChildren, ReactElement } from 'react';
import { KeyboardAvoidingView, Platform, type RefreshControlProps, ScrollView, StyleSheet } from 'react-native';

import { spacing, useAppTheme } from '../../theme/theme';

interface ScreenProps extends PropsWithChildren {
  readonly refreshControl?: ReactElement<RefreshControlProps>;
}

/** Contenedor de pantalla: scroll, fondo del tema y ajuste automático al teclado y al header. */
export function Screen({ children, refreshControl }: ScreenProps) {
  const { colors } = useAppTheme();
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={[styles.flex, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
});
