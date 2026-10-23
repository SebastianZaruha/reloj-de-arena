/**
 * Motor de SESIÓN (fase 3): encadena los tramos de un `SessionPlan`
 * (trabajo, descanso, trabajo...) usando el motor del temporizador de
 * siempre para el tramo actual.
 *
 * Igual que el temporizador, todo son FUNCIONES PURAS sobre un estado
 * inmutable y basado en MARCAS DE TIEMPO:
 *
 *   - Cuando un tramo se acaba, el siguiente empieza EXACTAMENTE en el
 *     instante en que acabó el anterior (`startedAt = fin del anterior`),
 *     no cuando la app se entera. Así no se acumula retraso aunque la app
 *     esté en segundo plano: al volver, `settle` recorre de golpe todos los
 *     tramos que hayan pasado y la cuenta sigue exacta.
 *   - `transitions` cuenta los cambios de tramo NATURALES (al agotarse el
 *     tiempo). La pantalla lo usa para saber cuándo voltear el reloj y sonar;
 *     nunca baja (ni al reiniciar), así un cambio siempre se detecta.
 *
 * Un temporizador simple es una sesión con un solo tramo: la app usa SIEMPRE
 * este motor y no tiene dos caminos distintos.
 */
import {
  createTimer,
  elapsedAt,
  flip as flipTimer,
  pause as pauseTimer,
  resume as resumeTimer,
  snapshot as timerSnapshot,
  start as startTimer,
} from '../timer/engine';
import { MAX_DURATION_MS, MIN_DURATION_MS } from '../timer/duration';
import { parseTimer } from '../timer/serialize';
import type { TimerSnapshot, TimerState, TimerStatus } from '../timer/types';
import { roundOfSegment, roundsInPlan } from './cycles';
import { nextSegmentIndex, type SegmentKind, type SessionPlan, type SessionSegment } from './plan';

export interface SessionState {
  readonly plan: SessionPlan;
  /** Tramo actual (índice en `plan.segments`). */
  readonly index: number;
  /** Temporizador del tramo actual. */
  readonly timer: TimerState;
  /** Cambios de tramo naturales desde que se creó (nunca baja). */
  readonly transitions: number;
}

/**
 * Foto de la sesión en un instante. Es un `TimerSnapshot` del tramo actual
 * (lo que necesita el reloj para dibujar la arena) más datos de la sesión.
 * El `status` es el de la SESIÓN: 'finished' solo cuando acaba el último tramo.
 */
export interface SessionSnapshot extends TimerSnapshot {
  readonly index: number;
  readonly segmentCount: number;
  readonly kind: SegmentKind;
  /** Ronda actual (desde 1) y total de rondas. */
  readonly round: number;
  readonly rounds: number;
  /** ¿Es una sesión de ciclos (más de un tramo)? */
  readonly isCycle: boolean;
  readonly transitions: number;
}

/** Límite de tramos que `settle` avanza de una vez (protege de planes que se repiten). */
const MAX_SETTLE_STEPS = 10_000;

/** Crea una sesión en reposo al principio del plan. */
export function createSession(plan: SessionPlan, transitions = 0): SessionState {
  const first = plan.segments[0];
  if (!first) throw new RangeError('El plan no tiene tramos');
  return { plan, index: 0, timer: createTimer(first.durationMs), transitions };
}

/**
 * Pasa al tramo siguiente todas las veces que haga falta hasta `now`.
 * Si se acaba el último tramo, la sesión queda terminada.
 */
export function settle(state: SessionState, now: number): SessionState {
  let s = state;
  for (let i = 0; i < MAX_SETTLE_STEPS; i++) {
    const t = s.timer;
    if (t.status !== 'running' || t.startedAt === null) return s;
    if (elapsedAt(t, now) < t.durationMs) return s;
    // Instante exacto en que se acabó el tramo.
    const endedAt = t.startedAt + (t.durationMs - t.accumulatedMs);
    const next = nextSegmentIndex(s.plan, s.index);
    if (next === null) {
      return {
        ...s,
        timer: { status: 'finished', durationMs: t.durationMs, startedAt: null, accumulatedMs: t.durationMs },
      };
    }
    const segment = s.plan.segments[next] as { durationMs: number };
    s = {
      ...s,
      index: next,
      transitions: s.transitions + 1,
      timer: { status: 'running', durationMs: segment.durationMs, startedAt: endedAt, accumulatedMs: 0 },
    };
  }
  return s;
}

/** Foto completa de la sesión en `now` (no modifica el estado). */
export function sessionSnapshot(state: SessionState, now: number): SessionSnapshot {
  const s = settle(state, now);
  const t = timerSnapshot(s.timer, now);
  const segment = s.plan.segments[s.index] as { kind: SegmentKind };
  return {
    ...t,
    index: s.index,
    segmentCount: s.plan.segments.length,
    kind: segment.kind,
    round: roundOfSegment(s.plan, s.index),
    rounds: roundsInPlan(s.plan),
    isCycle: s.plan.segments.length > 1,
    transitions: s.transitions,
  };
}

/** Avanza tramos si toca (se llama periódicamente desde la UI). */
export function tickSession(state: SessionState, now: number): SessionState {
  return settle(state, now);
}

/** Empieza desde el reposo. */
export function startSession(state: SessionState, now: number): SessionState {
  return withTimer(state, startTimer(state.timer, now));
}

export function pauseSession(state: SessionState, now: number): SessionState {
  const s = settle(state, now);
  return withTimer(s, pauseTimer(s.timer, now));
}

export function resumeSession(state: SessionState, now: number): SessionState {
  return withTimer(state, resumeTimer(state.timer, now));
}

/**
 * Toque simple: empieza, pausa o reanuda. Si la sesión ya terminó, vuelve
 * al principio (en reposo) para poder empezar de nuevo.
 */
export function toggleSession(state: SessionState, now: number): SessionState {
  const s = settle(state, now);
  switch (sessionStatus(s)) {
    case 'idle':
      return startSession(s, now);
    case 'running':
      return pauseSession(s, now);
    case 'paused':
      return resumeSession(s, now);
    case 'finished':
      return restartSession(s);
  }
}

/**
 * Voltear el móvil: como un reloj de verdad, el tramo ACTUAL empieza de cero
 * y ya corriendo. Si la sesión había terminado, empieza otra vez desde el
 * primer tramo.
 */
export function flipSession(state: SessionState, now: number): SessionState {
  const s = settle(state, now);
  if (sessionStatus(s) === 'finished') return startSession(restartSession(s), now);
  return withTimer(s, flipTimer(s.timer, now));
}

/** Vuelve al principio del plan, en reposo. */
export function restartSession(state: SessionState): SessionState {
  return createSession(state.plan, state.transitions);
}

/**
 * Cambia de plan (otra duración, otro ciclo...). Vuelve al reposo con el
 * plan nuevo. Mientras corre no hace nada: para no romper una cuenta sin
 * querer (el gesto de deslizar está desactivado en marcha, pero por si acaso).
 * Para forzarlo (cambios desde el menú) usa `replacePlan`.
 */
export function setSessionPlan(state: SessionState, plan: SessionPlan): SessionState {
  if (state.timer.status === 'running') return state;
  return createSession(plan, state.transitions);
}

/** Cambia de plan SIEMPRE (también en marcha) y vuelve al reposo. */
export function replacePlan(state: SessionState, plan: SessionPlan): SessionState {
  return createSession(plan, state.transitions);
}

/** Estado de la sesión (el del temporizador del tramo actual). */
export function sessionStatus(state: SessionState): TimerStatus {
  return state.timer.status;
}

function withTimer(state: SessionState, timer: TimerState): SessionState {
  return timer === state.timer ? state : { ...state, timer };
}

/**
 * Avisos de la sesión, comparando la foto anterior con la actual:
 *  - 'phase-change': ha cambiado de tramo de forma natural (sube `transitions`).
 *  - 'finished': la última arena se ha acabado sola (running → finished).
 * Reiniciar, pausar o voltear a mano no avisan.
 */
export type SessionCue = 'phase-change' | 'finished';

export function sessionCue(
  previous: Pick<SessionSnapshot, 'status' | 'transitions'>,
  next: Pick<SessionSnapshot, 'status' | 'transitions'>,
): SessionCue | null {
  if (previous.status === 'running' && next.status === 'finished') return 'finished';
  if (next.transitions > previous.transitions && next.status === 'running') return 'phase-change';
  return null;
}

// ─── Guardar y recuperar (recarga de recuperación en la web) ───────────────

/** Convierte la sesión en texto (JSON). */
export function serializeSession(state: SessionState): string {
  return JSON.stringify(state);
}

/**
 * Valida una sesión leída de fuera. Devuelve null si algo no cuadra: nunca
 * confiamos en datos guardados sin comprobarlos.
 */
export function parseSession(input: unknown, now: number): SessionState | null {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const plan = r.plan as Record<string, unknown> | null;
  if (typeof plan !== 'object' || plan === null || !Array.isArray(plan.segments)) return null;
  const segments: SessionSegment[] = [];
  for (const seg of plan.segments as unknown[]) {
    if (typeof seg !== 'object' || seg === null) return null;
    const { kind, durationMs } = seg as Record<string, unknown>;
    if (kind !== 'focus' && kind !== 'break') return null;
    if (typeof durationMs !== 'number' || durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) {
      return null;
    }
    segments.push({ kind, durationMs });
  }
  if (segments.length === 0) return null;
  const index = r.index;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= segments.length)
    return null;
  const timer = parseTimer(r.timer, now);
  if (!timer || timer.durationMs !== segments[index]?.durationMs) return null;
  const transitions = typeof r.transitions === 'number' && Number.isFinite(r.transitions) ? r.transitions : 0;
  return { plan: { segments, repeat: plan.repeat === true }, index, timer, transitions };
}
