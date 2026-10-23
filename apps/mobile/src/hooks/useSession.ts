/**
 * Hook que conecta el motor de SESIÓN del core con React (1.5; sustituye a
 * useTimer). Una sesión simple es un plan de un solo tramo, así que la
 * pantalla tiene un único camino para «sesión única» y «ciclos».
 *
 * - El estado vive en un `useState` (para re-renderizar al cambiar) y en una
 *   ref (para que el bucle de animación y los gestos lo lean sin esperar a
 *   React). La ref solo cambia en `apply`.
 * - Mientras corre, refrescamos 4 veces por segundo. No importa si algún
 *   refresco se retrasa: el tiempo y los cambios de fase se calculan con
 *   marcas de tiempo (`settle` en el core), nunca contando ticks.
 * - Al volver de segundo plano (AppState "active") forzamos un refresco: si
 *   pasaron varias fases mientras tanto, `tickSession` las recorre de golpe.
 */
import {
  createSession,
  flipSession,
  pauseSession,
  replacePlan as replaceSessionPlan,
  restartSession,
  resumeSession,
  sessionSnapshot,
  setSessionPlan,
  systemClock,
  tickSession,
  toggleSession,
  type Clock,
  type SessionPlan,
  type SessionSnapshot,
  type SessionState,
} from '@reloj/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { takeRecoveredSession } from '../recovery/sessionRecovery';

const DISPLAY_REFRESH_MS = 250;

export interface UseSession {
  readonly state: SessionState;
  /** Foto calculada en el último refresco (para mostrar texto). */
  readonly view: SessionSnapshot;
  /** Foto calculada AHORA (para el bucle de animación). */
  readonly getSnapshot: () => SessionSnapshot;
  readonly toggle: () => void;
  /** Pausar / reanudar sin alternar (los usa la pausa por tumbar el móvil). */
  readonly pause: () => void;
  readonly resume: () => void;
  /** Voltear: la fase actual empieza de cero (1.3; en ciclos, 1.5). */
  readonly flip: () => void;
  /** Volver al principio del plan, en reposo. */
  readonly restart: () => void;
  /** Otro plan, solo si no está corriendo (gesto de deslizar). */
  readonly setPlan: (plan: SessionPlan) => void;
  /** Otro plan SIEMPRE, vuelve al reposo (cambios desde el menú). */
  readonly replacePlan: (plan: SessionPlan) => void;
}

export function useSession(initialPlan: SessionPlan, clock: Clock = systemClock): UseSession {
  // Si venimos de una recarga de recuperación (web), seguimos donde íbamos.
  const [state, setState] = useState<SessionState>(
    () => takeRecoveredSession(clock.now()) ?? createSession(initialPlan),
  );
  const stateRef = useRef(state);
  const [, forceRender] = useState(0);

  /** Aplica una transición y actualiza ref + estado a la vez. */
  const apply = useCallback((fn: (s: SessionState) => SessionState) => {
    const next = fn(stateRef.current);
    if (next !== stateRef.current) {
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const getSnapshot = useCallback(() => sessionSnapshot(stateRef.current, clock.now()), [clock]);

  // Refresco periódico solo mientras corre.
  const running = state.timer.status === 'running';
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      apply((s) => tickSession(s, clock.now()));
      forceRender((n) => n + 1);
    }, DISPLAY_REFRESH_MS);
    return () => clearInterval(id);
  }, [running, apply, clock]);

  // Al volver a primer plano, recalculamos (por si terminó o cambió de fase).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        apply((st) => tickSession(st, clock.now()));
        forceRender((n) => n + 1);
      }
    });
    return () => sub.remove();
  }, [apply, clock]);

  return {
    state,
    view: sessionSnapshot(state, clock.now()),
    getSnapshot,
    toggle: useCallback(() => apply((s) => toggleSession(s, clock.now())), [apply, clock]),
    pause: useCallback(() => apply((s) => pauseSession(s, clock.now())), [apply, clock]),
    resume: useCallback(() => apply((s) => resumeSession(s, clock.now())), [apply, clock]),
    flip: useCallback(() => apply((s) => flipSession(s, clock.now())), [apply, clock]),
    restart: useCallback(() => apply(restartSession), [apply]),
    setPlan: useCallback((plan: SessionPlan) => apply((s) => setSessionPlan(s, plan)), [apply]),
    replacePlan: useCallback((plan: SessionPlan) => apply((s) => replaceSessionPlan(s, plan)), [apply]),
  };
}
