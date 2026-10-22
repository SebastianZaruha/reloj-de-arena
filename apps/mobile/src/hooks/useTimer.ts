/**
 * Hook que conecta el motor puro del core con React.
 *
 * - El estado del temporizador vive en un `useState` (para re-renderizar al
 *   cambiar de estado) y en una ref (para que el bucle de animación lo lea
 *   sin esperar a React).
 * - Mientras corre, refrescamos el texto 4 veces por segundo. No importa si
 *   algún refresco se retrasa: el tiempo se calcula siempre con marcas de
 *   tiempo, nunca contando ticks.
 * - Al volver de segundo plano (AppState "active") forzamos un refresco.
 */
import {
  createTimer,
  flip as flipTimer,
  pause as pauseTimer,
  restart as restartTimer,
  resume as resumeTimer,
  setDuration as setTimerDuration,
  snapshot,
  systemClock,
  tick,
  toggle as toggleTimer,
  type Clock,
  type TimerSnapshot,
  type TimerState,
} from '@reloj/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { takeRecoveredTimer } from '../recovery/sessionRecovery';

const DISPLAY_REFRESH_MS = 250;

export interface UseTimer {
  readonly state: TimerState;
  /** Foto calculada en el último refresco (para mostrar texto). */
  readonly view: TimerSnapshot;
  /** Foto calculada AHORA (para el bucle de animación). */
  readonly getSnapshot: () => TimerSnapshot;
  readonly toggle: () => void;
  /** Pausar / reanudar sin alternar (los usa la pausa por tumbar el móvil). */
  readonly pause: () => void;
  readonly resume: () => void;
  /** Voltear: empezar de cero con la misma duración (1.3). */
  readonly flip: () => void;
  readonly restart: () => void;
  readonly setDuration: (ms: number) => void;
}

export function useTimer(initialDurationMs: number, clock: Clock = systemClock): UseTimer {
  // Si venimos de una recarga de recuperación (web), seguimos donde íbamos.
  const [state, setState] = useState<TimerState>(
    () => takeRecoveredTimer(clock.now()) ?? createTimer(initialDurationMs),
  );
  // La ref se actualiza SOLO en `apply`, que es la única vía de cambiar el estado.
  const stateRef = useRef(state);
  const [, forceRender] = useState(0);

  /** Aplica una transición y actualiza ref + estado a la vez. */
  const apply = useCallback((fn: (s: TimerState) => TimerState) => {
    const next = fn(stateRef.current);
    if (next !== stateRef.current) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const getSnapshot = useCallback(() => snapshot(stateRef.current, clock.now()), [clock]);

  // Refresco periódico solo mientras corre.
  useEffect(() => {
    if (state.status !== 'running') return;
    const id = setInterval(() => {
      apply((s) => tick(s, clock.now()));
      forceRender((n) => n + 1);
    }, DISPLAY_REFRESH_MS);
    return () => clearInterval(id);
  }, [state.status, apply, clock]);

  // Al volver a primer plano, recalculamos (por si terminó mientras tanto).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        apply((st) => tick(st, clock.now()));
        forceRender((n) => n + 1);
      }
    });
    return () => sub.remove();
  }, [apply, clock]);

  return {
    state,
    view: snapshot(state, clock.now()),
    getSnapshot,
    toggle: useCallback(() => apply((s) => toggleTimer(s, clock.now())), [apply, clock]),
    pause: useCallback(() => apply((s) => pauseTimer(s, clock.now())), [apply, clock]),
    resume: useCallback(() => apply((s) => resumeTimer(s, clock.now())), [apply, clock]),
    flip: useCallback(() => apply((s) => flipTimer(s, clock.now())), [apply, clock]),
    restart: useCallback(() => apply(restartTimer), [apply]),
    setDuration: useCallback((ms: number) => apply((s) => setTimerDuration(s, ms)), [apply]),
  };
}
