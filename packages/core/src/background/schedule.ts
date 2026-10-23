/**
 * Segundo plano (fase 4, Android): la cuenta vista «desde fuera de la app».
 *
 * Con la app en segundo plano o cerrada, JavaScript no corre (o corre a
 * ratos). Quien sigue la cuenta es Android: una notificación con un
 * cronómetro nativo y alarmas exactas en cada cambio de fase y al final.
 * Este archivo es la parte PURA de eso (sin Android, con tests):
 *
 *  1. `upcomingEvents(state, now)`: la lista de avisos que hay que programar
 *     (cada cambio de fase y el fin), con su instante exacto. Sale de las
 *     mismas marcas de tiempo que el motor de sesiones: si el tramo actual
 *     acaba a las 10:25, el descanso empieza a las 10:25 y dura lo que dura.
 *
 *  2. `BackgroundSession`: un resumen MÍNIMO de la sesión que entiende el
 *     módulo nativo (lo guarda en disco y lo usa la notificación aunque la
 *     app esté cerrada). Solo lleva duraciones y una marca de tiempo:
 *
 *        en marcha → `phaseEndsAt`  (cuándo acaba el tramo actual)
 *        en pausa  → `remainingMs`  (cuánto le queda al tramo actual)
 *
 *     Con eso, pausar, reanudar o reiniciar desde la notificación es pura
 *     aritmética, sin lógica de ciclos. `pauseBackground`, `resumeBackground`,
 *     `restartBackground` y `settleBackground` son la REFERENCIA de lo que
 *     hace el módulo Kotlin (`TimerModel.kt`): los tests comprueban que dan
 *     lo mismo que el motor de sesiones. Si cambias una, cambia la otra.
 *
 *  3. `sessionFromBackground`: el camino de vuelta. Si se pausó desde la
 *     notificación, o la app se cerró y se vuelve a abrir, la app rehace su
 *     `SessionState` a partir de lo que guardó el módulo nativo.
 */
import { createSession, settle, type SessionState } from '../session/session';
import type { SessionPlan } from '../session/plan';
import { MAX_DURATION_MS, MIN_DURATION_MS } from '../timer/duration';

/** Tipos de aviso: cambio de fase (trabajo ↔ descanso) o fin de la sesión. */
export type BackgroundEventKind = 'phase-change' | 'finished';

export interface BackgroundEvent {
  readonly kind: BackgroundEventKind;
  /** Instante exacto del aviso (ms, como `Date.now()`). */
  readonly at: number;
  /** Tramo que EMPIEZA en ese instante (cambio de fase) o el último tramo (fin). */
  readonly index: number;
}

/**
 * Tope de avisos programados de una vez. Un ciclo de 12 rondas tiene 23
 * tramos; el tope solo protege de planes que se repiten (`repeat`), que no
 * acabarían nunca.
 */
export const MAX_BACKGROUND_EVENTS = 48;

/** Límite de tramos que `settleBackground` avanza de una vez (como en el motor de sesiones). */
const MAX_SETTLE_STEPS = 10_000;

/** Resumen de la sesión para el módulo nativo (ver comentario de arriba). */
export interface BackgroundSession {
  /** 'finished' solo lo produce `settleBackground` (la app nunca lo envía). */
  readonly status: 'running' | 'paused' | 'finished';
  /** Duración de cada tramo del plan (ms). */
  readonly durations: readonly number[];
  readonly repeat: boolean;
  /** Tramo actual. */
  readonly index: number;
  /** En marcha: instante en que acaba el tramo actual. Si no, null. */
  readonly phaseEndsAt: number | null;
  /** En pausa: lo que le queda al tramo actual. Si no, null. */
  readonly remainingMs: number | null;
  /** Contador de cambios de fase de la sesión (ver `SessionState.transitions`). */
  readonly transitions: number;
}

/**
 * Resumen de una sesión en `now`. Devuelve null si no hay nada que seguir en
 * segundo plano (en reposo o terminada): entonces no hay notificación.
 */
export function toBackgroundSession(state: SessionState, now: number): BackgroundSession | null {
  const s = settle(state, now);
  const t = s.timer;
  const base = {
    durations: s.plan.segments.map((seg) => seg.durationMs),
    repeat: s.plan.repeat,
    index: s.index,
    transitions: s.transitions,
  };
  if (t.status === 'running' && t.startedAt !== null) {
    // Lo mismo que calcula `settle`: inicio + lo que faltaba al arrancar.
    const phaseEndsAt = t.startedAt + (t.durationMs - t.accumulatedMs);
    return { ...base, status: 'running', phaseEndsAt, remainingMs: null };
  }
  if (t.status === 'paused') {
    return { ...base, status: 'paused', phaseEndsAt: null, remainingMs: t.durationMs - t.accumulatedMs };
  }
  return null;
}

/**
 * Avisos que faltan, en orden: un 'phase-change' al final de cada tramo
 * (salvo el último) y un 'finished' al final del último. En pausa no hay
 * ninguno (el tiempo no corre): se vuelven a calcular al reanudar.
 */
export function backgroundEvents(bg: BackgroundSession): BackgroundEvent[] {
  if (bg.status !== 'running' || bg.phaseEndsAt === null) return [];
  const events: BackgroundEvent[] = [];
  let index = bg.index;
  let at = bg.phaseEndsAt;
  while (events.length < MAX_BACKGROUND_EVENTS) {
    const next = nextIndex(bg, index);
    if (next === null) {
      events.push({ kind: 'finished', at, index });
      break;
    }
    events.push({ kind: 'phase-change', at, index: next });
    index = next;
    at += bg.durations[next] as number;
  }
  return events;
}

/** Avisos que faltan para una sesión (lista vacía si no está en marcha). */
export function upcomingEvents(state: SessionState, now: number): BackgroundEvent[] {
  const bg = toBackgroundSession(state, now);
  return bg ? backgroundEvents(bg) : [];
}

// ─── Lo que hace el módulo nativo (referencia de TimerModel.kt) ────────────

/**
 * Pasa los tramos que hayan acabado hasta `now`. Cada tramo nuevo empieza
 * justo cuando acabó el anterior (igual que `settle` del motor de sesiones).
 */
export function settleBackground(bg: BackgroundSession, now: number): BackgroundSession {
  if (bg.status !== 'running' || bg.phaseEndsAt === null) return bg;
  let { index, transitions } = bg;
  let end = bg.phaseEndsAt;
  for (let i = 0; i < MAX_SETTLE_STEPS && now >= end; i++) {
    const next = nextIndex(bg, index);
    if (next === null)
      return { ...bg, status: 'finished', index, phaseEndsAt: null, remainingMs: 0, transitions };
    index = next;
    transitions++;
    end += bg.durations[next] as number;
  }
  return { ...bg, index, transitions, phaseEndsAt: end };
}

/** Pausa: se congela lo que le queda al tramo actual. */
export function pauseBackground(bg: BackgroundSession, now: number): BackgroundSession {
  const s = settleBackground(bg, now);
  if (s.status !== 'running' || s.phaseEndsAt === null) return s;
  return { ...s, status: 'paused', phaseEndsAt: null, remainingMs: s.phaseEndsAt - now };
}

/** Reanudar: el tramo acabará dentro de lo que le quedaba. */
export function resumeBackground(bg: BackgroundSession, now: number): BackgroundSession {
  if (bg.status !== 'paused' || bg.remainingMs === null) return bg;
  return { ...bg, status: 'running', phaseEndsAt: now + bg.remainingMs, remainingMs: null };
}

/**
 * Reiniciar DESDE LA NOTIFICACIÓN: vuelve al primer tramo y sigue en marcha.
 * (En la app, mantener pulsado deja el reloj en reposo; desde la notificación
 * no habría forma de volver a empezarlo, así que arranca ya. Es lo mismo que
 * `startSession(restartSession(s), now)`.)
 */
export function restartBackground(bg: BackgroundSession, now: number): BackgroundSession {
  return {
    ...bg,
    status: 'running',
    index: 0,
    phaseEndsAt: now + (bg.durations[0] as number),
    remainingMs: null,
  };
}

// ─── Vuelta a la app ───────────────────────────────────────────────────────

/**
 * Rehace la sesión de la app a partir del resumen nativo. El plan lo pone la
 * app (sale de los ajustes); si no coincide con las duraciones guardadas
 * (p. ej. se cambió el ciclo), devuelve null y la app empieza en reposo.
 */
export function sessionFromBackground(
  bg: BackgroundSession,
  plan: SessionPlan,
  now: number,
): SessionState | null {
  const durations = plan.segments.map((s) => s.durationMs);
  if (durations.length !== bg.durations.length || durations.some((d, i) => d !== bg.durations[i])) {
    return null;
  }
  if (plan.repeat !== bg.repeat) return null;
  const durationMs = durations[bg.index];
  if (durationMs === undefined) return null;
  const base = createSession(plan, bg.transitions);
  if (bg.status === 'finished') {
    return {
      ...base,
      index: bg.index,
      timer: { status: 'finished', durationMs, startedAt: null, accumulatedMs: durationMs },
    };
  }
  if (bg.status === 'paused' && bg.remainingMs !== null) {
    const remaining = Math.min(durationMs, Math.max(0, bg.remainingMs));
    return {
      ...base,
      index: bg.index,
      timer: { status: 'paused', durationMs, startedAt: null, accumulatedMs: durationMs - remaining },
    };
  }
  if (bg.status === 'running' && bg.phaseEndsAt !== null) {
    // «Empezó hace (duración − lo que le queda)»: mismo instante de fin.
    // Si quedara más que la duración (reloj del sistema cambiado), se recorta.
    const startedAt = Math.min(now, bg.phaseEndsAt - durationMs);
    const state: SessionState = {
      ...base,
      index: bg.index,
      timer: { status: 'running', durationMs, startedAt, accumulatedMs: 0 },
    };
    return settle(state, now);
  }
  return null;
}

/**
 * Valida un resumen leído de fuera (lo que guardó el módulo nativo). Nunca
 * confiamos en datos guardados sin comprobarlos: devuelve null si no cuadra.
 */
export function parseBackgroundSession(input: unknown): BackgroundSession | null {
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
  const status = r.status;
  if (status !== 'running' && status !== 'paused' && status !== 'finished') return null;
  if (!Array.isArray(r.durations) || r.durations.length === 0) return null;
  const durations: number[] = [];
  for (const d of r.durations as unknown[]) {
    if (typeof d !== 'number' || !Number.isFinite(d) || d < MIN_DURATION_MS || d > MAX_DURATION_MS)
      return null;
    durations.push(d);
  }
  const index = r.index;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= durations.length) {
    return null;
  }
  const phaseEndsAt = finiteOrNull(r.phaseEndsAt);
  const remainingMs = finiteOrNull(r.remainingMs);
  if (status === 'running' && phaseEndsAt === null) return null;
  if (status === 'paused' && remainingMs === null) return null;
  const transitions = typeof r.transitions === 'number' && Number.isFinite(r.transitions) ? r.transitions : 0;
  return {
    status,
    durations,
    repeat: r.repeat === true,
    index,
    phaseEndsAt: status === 'running' ? phaseEndsAt : null,
    remainingMs: status === 'paused' ? remainingMs : status === 'finished' ? 0 : null,
    transitions,
  };
}

/** Tramo siguiente, o null si se acabó el plan (igual que `nextSegmentIndex`). */
function nextIndex(bg: BackgroundSession, index: number): number | null {
  const next = index + 1;
  if (next < bg.durations.length) return next;
  return bg.repeat ? 0 : null;
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
