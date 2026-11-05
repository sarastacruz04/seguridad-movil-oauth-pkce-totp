import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { expoCryptoProvider } from '../lib/crypto/expoCrypto';
import { runAllSelfTests, type SelfTestSuite } from '../lib/selftest/selfTests';
import { monoFont, spacing, useAppTheme } from '../theme/theme';
import { AppButton } from './ui/AppButton';
import { Banner } from './ui/Banner';

/** Corre los vectores oficiales de los RFC EN EL TELÉFONO, con expo-crypto y sin red. */
export function SelfTestPanel() {
  const { colors } = useAppTheme();
  const [suites, setSuites] = useState<SelfTestSuite[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const run = async () => {
    setRunning(true);
    setError(null);
    const start = Date.now();
    try {
      setSuites(await runAllSelfTests(expoCryptoProvider));
      setElapsedMs(Date.now() - start);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al ejecutar las pruebas');
    } finally {
      setRunning(false);
    }
  };

  const total = suites?.reduce((sum, suite) => sum + suite.cases.length, 0) ?? 0;
  const passed = suites?.reduce((sum, suite) => sum + suite.cases.filter((c) => c.passed).length, 0) ?? 0;

  return (
    <View style={styles.panel}>
      <AppButton
        label="Ejecutar self-tests en el dispositivo"
        icon="flask-outline"
        variant="secondary"
        onPress={() => void run()}
        loading={running}
      />
      {error ? <Banner tone="danger" message={error} /> : null}
      {suites ? (
        <>
          <Banner
            tone={passed === total ? 'success' : 'danger'}
            message={`${passed}/${total} vectores correctos en ${elapsedMs} ms (expo-crypto, sin red)`}
          />
          {suites.map((suite) => (
            <View key={suite.id} style={styles.suite}>
              <View style={styles.suiteHeader}>
                <Ionicons
                  name={suite.passed ? 'checkmark-circle' : 'close-circle'}
                  size={18}
                  color={suite.passed ? colors.success : colors.danger}
                />
                <Text style={[styles.suiteTitle, { color: colors.text }]}>{suite.title}</Text>
              </View>
              {suite.cases.map((testCase) => (
                <Text key={testCase.name} style={[styles.case, { color: testCase.passed ? colors.textMuted : colors.danger }]}>
                  {testCase.passed ? '✓' : '✕'} {testCase.name}: {testCase.actual}
                  {testCase.passed ? '' : ` (esperado ${testCase.expected})`}
                </Text>
              ))}
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.md },
  suite: { gap: 2 },
  suiteHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  suiteTitle: { fontWeight: '700', fontSize: 14 },
  case: { fontFamily: monoFont, fontSize: 11, lineHeight: 16 },
});
