/**
 * Código TOTP en vivo, sin parpadeos y 100% offline (el tiempo sale de Date.now(), nunca de la red).
 *
 *  - Solo se recalcula cuando cambia la ventana T = floor(t / 30).
 *  - El código de T+1 se precalcula en segundo plano: en el límite de la ventana el cambio es inmediato.
 *  - Nunca se muestra un estado vacío: el código anterior se mantiene hasta que el nuevo está listo.
 *  - La barra de progreso la anima el hilo nativo (useNativeDriver) sincronizada con Date.now().
 *  - Al volver del segundo plano (AppState "active") se resincroniza todo.
 */
import { useEffect, useMemo, useState } from 'react';
import { Animated, AppState, Easing } from 'react-native';

import { decodeBase32, getSecondsRemaining, getTimeStep, TOTP_PERIOD_SECONDS, totpEngine } from '../lib/totp';

const PERIOD_MS = TOTP_PERIOD_SECONDS * 1000;

export interface TotpCodeState {
  /** Código de 6 dígitos de la ventana actual (null solo durante el primer cálculo). */
  readonly code: string | null;
  readonly secondsRemaining: number;
  /** 1 → 0 a lo largo de la ventana de 30 s. */
  readonly progress: Animated.Value;
  readonly error: string | null;
}

type DecodedSecret = { readonly key: Uint8Array; readonly error: null } | { readonly key: null; readonly error: string };

function decodeSecret(secret: string): DecodedSecret {
  try {
    return { key: decodeBase32(secret), error: null };
  } catch (err) {
    return { key: null, error: err instanceof Error ? err.message : 'Semilla inválida' };
  }
}

export function useTotpCode(secret: string): TotpCodeState {
  const decoded = useMemo(() => decodeSecret(secret), [secret]);
  const [progress] = useState(() => new Animated.Value(1));
  const [current, setCurrent] = useState<{ secret: string; step: number; code: string } | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(() => getSecondsRemaining(Date.now() / 1000));
  const [computeError, setComputeError] = useState<string | null>(null);

  useEffect(() => {
    const { key } = decoded;
    if (!key) return undefined;

    let disposed = false;
    let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
    const cache = new Map<number, Promise<string>>(); // T → código (promesa: no se calcula dos veces)

    const codeFor = (step: number): Promise<string> => {
      let pending = cache.get(step);
      if (!pending) {
        pending = totpEngine.hotp(key, step); // HMAC-SHA1(K, T) + truncamiento dinámico
        cache.set(step, pending);
      }
      return pending;
    };

    const animateProgress = (msLeft: number) => {
      progress.stopAnimation();
      progress.setValue(msLeft / PERIOD_MS);
      Animated.timing(progress, { toValue: 0, duration: msLeft, easing: Easing.linear, useNativeDriver: true }).start();
    };

    const sync = () => {
      const nowMs = Date.now();
      const step = getTimeStep(nowMs / 1000);
      const msLeft = PERIOD_MS - (nowMs % PERIOD_MS);

      codeFor(step)
        .then((code) => {
          // Hasta este momento se sigue mostrando el código anterior: nunca hay pantalla vacía.
          if (!disposed) setCurrent((prev) => (prev?.step === step && prev.code === code ? prev : { secret, step, code }));
        })
        .catch(() => {
          if (!disposed) setComputeError('No se pudo calcular el código.');
        });
      void codeFor(step + 1); // precálculo del siguiente paso
      for (const cachedStep of cache.keys()) if (cachedStep < step) cache.delete(cachedStep);

      animateProgress(msLeft);
      setSecondsRemaining(getSecondsRemaining(nowMs / 1000));
      clearTimeout(boundaryTimer);
      boundaryTimer = setTimeout(sync, msLeft + 15); // justo después del límite de la ventana
    };

    sync();
    // Contador numérico: el estado solo cambia una vez por segundo (React descarta valores iguales).
    const ticker = setInterval(() => setSecondsRemaining(getSecondsRemaining(Date.now() / 1000)), 250);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') sync(); // los timers se congelan en segundo plano
    });

    return () => {
      disposed = true;
      clearTimeout(boundaryTimer);
      clearInterval(ticker);
      subscription.remove();
      progress.stopAnimation();
    };
  }, [decoded, secret, progress]);

  return {
    // Un código calculado para OTRA semilla nunca se muestra.
    code: current?.secret === secret ? current.code : null,
    secondsRemaining,
    progress,
    error: decoded.error ?? computeError,
  };
}
