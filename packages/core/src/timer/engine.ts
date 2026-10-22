/**
 * Motor del temporizador: funciones puras que reciben un estado y la hora
 * actual y devuelven un estado nuevo.
 *
 * Diagrama de estados:
 *
 *   idle ──start──▶ running ──pause──▶ paused
 *    ▲               │  ▲               │
 *    │               │  └────resume─────┘
 *    │            (tiempo agotado)
 *    │               ▼
 *    └──restart── finished
 *
 * `restart` funciona desde cualquier estado y vuelve a `idle` con la misma
 * duración. `setDuration` solo tiene efecto cuando no está corriendo.
 */
import type { TimerSnapshot, TimerState } from './types';

/** Crea un temporizador en reposo con la duración indicada. */
export function createTimer(durationMs: number): TimerState {
  assertValidDuration(durationMs);
  return { status: 'idle', durationMs, startedAt: null, accumulatedMs: 0 };
}

/**
 * Milisegundos transcurridos en el instante `now`, limitado a la duración.
 * Es el corazón del diseño "basado en marcas de tiempo".
 */
export function elapsedAt(state: TimerState, now: number): number {
  const running = state.status === 'running' && state.startedAt !== null;
  // Math.max(0, ...) protege frente a relojes que retroceden (cambio de hora manual).
  const current = running ? Math.max(0, now - (state.startedAt as number)) : 0;
  return Math.min(state.durationMs, state.accumulatedMs + current);
}

/** Calcula la foto completa del temporizador en `now`. */
export function snapshot(state: TimerState, now: number): TimerSnapshot {
  const elapsedMs = elapsedAt(state, now);
  const remainingMs = state.durationMs - elapsedMs;
  // Si estaba corriendo y ya no queda tiempo, lo mostramos como terminado
  // aunque nadie haya llamado todavía a `tick`.
  const status = state.status === 'running' && remainingMs <= 0 ? 'finished' : state.status;
  return {
    status,
    durationMs: state.durationMs,
    elapsedMs,
    remainingMs,
    progress: state.durationMs === 0 ? 1 : elapsedMs / state.durationMs,
  };
}

/** Empieza a contar desde `idle`. En otros estados no hace nada. */
export function start(state: TimerState, now: number): TimerState {
  if (state.status !== 'idle') return state;
  return { ...state, status: 'running', startedAt: now, accumulatedMs: 0 };
}

/** Pausa: "congela" el tiempo transcurrido en `accumulatedMs`. */
export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== 'running') return state;
  const accumulatedMs = elapsedAt(state, now);
  if (accumulatedMs >= state.durationMs) return finish(state);
  return { ...state, status: 'paused', startedAt: null, accumulatedMs };
}

/** Reanuda desde `paused`. */
export function resume(state: TimerState, now: number): TimerState {
  if (state.status !== 'paused') return state;
  return { ...state, status: 'running', startedAt: now };
}

/**
 * Acción del toque simple: empieza, pausa o reanuda según el estado.
 * Si ya terminó, reinicia (vuelve a `idle`) para poder empezar de nuevo.
 */
export function toggle(state: TimerState, now: number): TimerState {
  switch (state.status) {
    case 'idle':
      return start(state, now);
    case 'running':
      return pause(state, now);
    case 'paused':
      return resume(state, now);
    case 'finished':
      return restart(state);
  }
}

/**
 * Voltear el reloj (1.3): como uno de verdad, empieza DE CERO con la duración
 * elegida y ya corriendo, esté como esté (en marcha, en pausa, terminado...).
 */
export function flip(state: TimerState, now: number): TimerState {
  return start(createTimer(state.durationMs), now);
}

/** Vuelve a `idle` conservando la duración elegida. */
export function restart(state: TimerState): TimerState {
  return createTimer(state.durationMs);
}

/**
 * Cambia la duración. Si estaba pausado o terminado, vuelve a `idle` con la
 * nueva duración. Mientras corre se ignora (para no "romper" una cuenta).
 */
export function setDuration(state: TimerState, durationMs: number): TimerState {
  if (state.status === 'running') return state;
  return createTimer(durationMs);
}

/**
 * Comprueba si el tiempo se ha agotado y, si es así, pasa a `finished`.
 * Se llama periódicamente desde la UI (no hace falta que sea preciso: el
 * tiempo se calcula siempre a partir de las marcas de tiempo).
 */
export function tick(state: TimerState, now: number): TimerState {
  if (state.status !== 'running') return state;
  return elapsedAt(state, now) >= state.durationMs ? finish(state) : state;
}

function finish(state: TimerState): TimerState {
  return { ...state, status: 'finished', startedAt: null, accumulatedMs: state.durationMs };
}

function assertValidDuration(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError(`Duración no válida: ${durationMs}`);
  }
}
