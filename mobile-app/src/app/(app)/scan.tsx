import { type BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';

import { totpAccountStore } from '@/authenticator/totpAccountStore';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { InvalidOtpauthUriError, parseOtpauthUri } from '@/lib/totp';
import { radius, spacing, useAppTheme } from '@/theme/theme';

/** Opción A: escaneo del QR otpauth://totp/… con expo-camera (CameraView). */
export default function ScanScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // El callback puede dispararse varias veces por segundo: se procesa UNA sola lectura.
  const handled = useRef(false);

  const onBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (handled.current) return;
    handled.current = true;
    try {
      const account = parseOtpauthUri(data);
      setSaving(true);
      await totpAccountStore.save(account);
      router.back();
    } catch (err) {
      setSaving(false);
      setError(err instanceof InvalidOtpauthUriError ? err.message : 'No se pudo guardar la semilla escaneada.');
    }
  };

  const retry = () => {
    setError(null);
    handled.current = false;
  };

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, styles.padded, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Permiso de cámara</Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          La cámara solo se usa para leer el código QR de tu semilla. No se toman ni guardan fotos.
        </Text>
        {permission.canAskAgain ? (
          <AppButton label="Permitir cámara" icon="camera-outline" onPress={() => void requestPermission()} />
        ) : (
          <AppButton label="Abrir ajustes" icon="settings-outline" onPress={() => void Linking.openSettings()} />
        )}
        <AppButton label="Usar la semilla manual" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <CameraView
        style={styles.flex}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={error || saving ? undefined : onBarcodeScanned}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.frame, { borderColor: colors.onPrimary }]} />
        <View style={styles.bottom}>
          {saving ? <Banner tone="success" message="Semilla leída. Guardando en el almacenamiento seguro…" /> : null}
          {error ? (
            <>
              <Banner tone="danger" title="QR no válido" message={error} />
              <AppButton label="Escanear de nuevo" icon="refresh" onPress={retry} />
            </>
          ) : (
            <Banner tone="info" message="Apunta al QR de /mfa/enroll (otpauth://totp/…)." />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  padded: { padding: spacing.xl },
  title: { fontSize: 20, fontWeight: '700' },
  text: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderWidth: 3, borderRadius: radius.lg },
  bottom: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.xxl, gap: spacing.sm },
});
