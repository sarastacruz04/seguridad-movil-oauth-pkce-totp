import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { fetchVault, verifyMfaCode } from '@/api/endpoints';
import { ApiError, describeError, ElevationExpiredError, MfaRequiredError } from '@/api/errors';
import type { Vault } from '@/api/responses';
import { logSecurityEvent } from '@/api/securityLog';
import { stepUpMemory } from '@/auth/stepUpMemory';
import { tokenStore } from '@/auth/tokenStore';
import { StepUpModal } from '@/components/StepUpModal';
import { AppButton } from '@/components/ui/AppButton';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { Screen } from '@/components/ui/Screen';
import { formatMmSs, useNow } from '@/hooks/useNow';
import { monoFont, radius, spacing, useAppTheme } from '@/theme/theme';

type VaultState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'locked' }
  | { readonly kind: 'open'; readonly vault: Vault }
  | { readonly kind: 'error'; readonly message: string };

type ReplayResult = { readonly tone: 'success' | 'warning' | 'danger'; readonly title: string; readonly message: string };

type VaultOutcome =
  | { readonly kind: 'open'; readonly vault: Vault }
  | { readonly kind: 'mfa'; readonly stepUpToken: string }
  | { readonly kind: 'error'; readonly message: string };

/** GET /api/boveda-critica con el token elevado si existe; si no, con el access_token normal. */
async function requestVault(): Promise<VaultOutcome> {
  try {
    return { kind: 'open', vault: await fetchVault(tokenStore.getElevatedToken()) };
  } catch (error) {
    if (error instanceof MfaRequiredError) {
      logSecurityEvent('warn', '403 mfa_required en la bóveda → se abre el modal 2FA');
      return { kind: 'mfa', stepUpToken: error.stepUpToken };
    }
    if (error instanceof ElevationExpiredError) {
      logSecurityEvent('warn', 'El token elevado venció → se vuelve a pedir 2FA');
      return requestVault(); // ya sin token elevado: el servidor responderá 403
    }
    return { kind: 'error', message: describeError(error) };
  }
}

export default function VaultScreen() {
  const { colors } = useAppTheme();
  const [state, setState] = useState<VaultState>({ kind: 'loading' });
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replaying, setReplaying] = useState(false);
  const tokens = useSyncExternalStore(tokenStore.subscribe, tokenStore.getSnapshot);
  const now = useNow(1000, state.kind === 'open');

  /** Un 403 mfa_required lo captura ESTA pantalla (no el interceptor) y abre el modal 2FA. */
  const openVault = useCallback(async () => {
    setState({ kind: 'loading' });
    const outcome = await requestVault();
    if (outcome.kind === 'mfa') {
      setStepUpToken(outcome.stepUpToken);
      setState({ kind: 'locked' });
    } else {
      setState(outcome);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void openVault();
    }, [openVault]),
  );

  // Si el token elevado vence con la bóveda abierta, la vista vuelve a bloquearse (estado derivado).
  const elevatedExpiresAt = tokens.elevatedExpiresAtMs;
  const elevationActive = elevatedExpiresAt !== null && elevatedExpiresAt > now;
  const view: VaultState = state.kind === 'open' && !elevationActive ? { kind: 'locked' } : state;

  const handleVerified = ({ elevatedToken, expiresIn, code }: { elevatedToken: string; expiresIn: number; code: string }) => {
    tokenStore.setElevatedToken(elevatedToken, expiresIn); // SOLO en memoria
    stepUpMemory.setLastCode(code);
    setStepUpToken(null);
    setReplay(null);
    void openVault(); // reintento automático con el token elevado
  };

  const lockVault = () => {
    tokenStore.clearElevatedToken();
    setState({ kind: 'locked' });
  };

  /** Escenario 5: reenvía el mismo código ya aceptado con un step_up_token fresco → 409. */
  const replayLastCode = async () => {
    const lastCode = stepUpMemory.getLastCode();
    if (!lastCode) return;
    setReplaying(true);
    setReplay(null);
    try {
      let freshStepUp: string;
      try {
        await fetchVault(null); // access_token normal → debe responder 403
        throw new Error('El servidor no pidió MFA');
      } catch (error) {
        if (!(error instanceof MfaRequiredError)) throw error;
        freshStepUp = error.stepUpToken;
      }
      logSecurityEvent('info', `Demo replay: reenviando el código ya usado ${lastCode}`);
      await verifyMfaCode(freshStepUp, lastCode);
      setReplay({
        tone: 'warning',
        title: 'El servidor aceptó el código',
        message: 'Pasaron más de 90 s: el código salió del caché anti-replay. Repite la demo justo después de verificar.',
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        logSecurityEvent('success', 'Replay bloqueado por el backend: 409 Conflict');
        setReplay({
          tone: 'success',
          title: 'Ataque bloqueado',
          message: `409 Conflict: ${error.serverMessage || 'Replay Attack Detected'}`,
        });
      } else if (error instanceof ApiError && error.status === 400) {
        setReplay({
          tone: 'warning',
          title: 'Código ya expirado',
          message: 'El código salió de las ventanas C-1/C/C+1; el servidor lo rechaza con 400. Repite la demo justo después de verificar.',
        });
      } else {
        setReplay({ tone: 'danger', title: 'No se pudo ejecutar la demo', message: describeError(error) });
      }
    } finally {
      setReplaying(false);
    }
  };

  const lastCode = stepUpMemory.getLastCode();

  return (
    <Screen>
      {view.kind === 'loading' ? <ActivityIndicator style={styles.loader} /> : null}

      {view.kind === 'error' ? (
        <>
          <Banner tone="danger" title="No se pudo abrir la bóveda" message={view.message} />
          <AppButton label="Reintentar" icon="refresh" onPress={() => void openVault()} />
        </>
      ) : null}

      {view.kind === 'locked' ? (
        <Card>
          <View style={styles.lockedIcon}>
            <Ionicons name="lock-closed" size={48} color={colors.primary} />
          </View>
          <Text style={[styles.lockedTitle, { color: colors.text }]}>Bóveda protegida</Text>
          <Text style={[styles.lockedText, { color: colors.textMuted }]}>
            Tu sesión normal no basta: este recurso exige un segundo factor (step-up). El servidor respondió 403 mfa_required.
          </Text>
          <AppButton label="Verificar con 2FA" icon="shield-checkmark-outline" onPress={() => void openVault()} />
        </Card>
      ) : null}

      {view.kind === 'open' ? (
        <>
          <Banner
            tone="success"
            title="Acceso autorizado con 2FA"
            message={`Token elevado (mfa_verified: true) en memoria · vence en ${formatMmSs(((elevatedExpiresAt ?? now) - now) / 1000)}`}
          />
          <Card title="Datos sensibles (ficticios)" subtitle={`Titular: ${view.vault.owner}`}>
            {view.vault.items.map((item) => (
              <View key={item.label} style={[styles.item, { borderColor: colors.border }]}>
                <InfoRow label={item.label} value={item.value} />
              </View>
            ))}
          </Card>
          <AppButton label="Cerrar bóveda" icon="lock-closed-outline" variant="secondary" onPress={lockVault} />
        </>
      ) : null}

      <Card
        title="Demo: ataque de repetición"
        subtitle="Reenvía el último código aceptado dentro de su ventana. El backend debe rechazarlo con 409.">
        <View style={[styles.codeChip, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.codeChipLabel, { color: colors.textMuted }]}>Último código usado</Text>
          <Text style={[styles.codeChipValue, { color: colors.text }]}>{lastCode ?? '—'}</Text>
        </View>
        <AppButton
          label="Reenviar último código usado"
          icon="repeat"
          variant="danger"
          onPress={() => void replayLastCode()}
          loading={replaying}
          disabled={!lastCode}
        />
        {replay ? (
          <View style={[styles.replayResult, { borderColor: replay.tone === 'success' ? colors.success : colors.warning }]}>
            {replay.tone === 'success' ? <Ionicons name="shield" size={32} color={colors.success} /> : null}
            <Banner tone={replay.tone} title={replay.title} message={replay.message} />
          </View>
        ) : null}
      </Card>

      <StepUpModal stepUpToken={stepUpToken} onVerified={handleVerified} onCancel={() => setStepUpToken(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxl },
  lockedIcon: { alignItems: 'center', marginTop: spacing.sm },
  lockedTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  lockedText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  codeChip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderRadius: radius.md },
  codeChipLabel: { fontSize: 13, fontWeight: '600' },
  codeChipValue: { fontFamily: monoFont, fontSize: 20, fontWeight: '700', letterSpacing: 2 },
  replayResult: { borderWidth: 2, borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm, alignItems: 'center' },
});
