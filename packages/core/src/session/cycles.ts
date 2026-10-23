/**
 * Ciclos trabajo/descanso (fase 3): preajustes, límites y cómo se convierte
 * una configuración en un `SessionPlan`.
 *
 * Una RONDA es un tramo de trabajo seguido de un descanso. La última ronda
 * termina al acabar su trabajo (no tiene descanso detrás): al final de la
 * sesión no tiene sentido «descansar» para nada. Si algún día se quiere
 * cambiar, basta con `FINAL_BREAK = true`.
 *
 *   4 rondas de 25/5 →  T  D  T  D  T  D  T   (7 tramos)
 */
import { DURATION_STEPS_MIN, MINUTE_MS, nearestStepIndex, stepToDuration } from '../timer/duration';
import type { SessionPlan, SessionSegment } from './plan';

/** Modo de sesión: un único temporizador o ciclos trabajo/descanso. */
export type SessionMode = 'single' | 'cycles';

/** Identificador de un preajuste de ciclo, o 'custom' (Personalizado). */
export type CyclePresetId = '25-5' | '50-10' | '15-3' | '90-15' | 'custom';

/** Configuración de un ciclo, en minutos y rondas (lo que ve la persona). */
export interface CycleConfig {
  readonly workMin: number;
  readonly breakMin: number;
  readonly rounds: number;
}

/** Rondas de los preajustes (el número solo se elige en «Personalizado»). */
export const PRESET_ROUNDS = 4;

/** Preajustes en el orden en que se muestran. */
export const CYCLE_PRESETS: readonly {
  readonly id: Exclude<CyclePresetId, 'custom'>;
  readonly config: CycleConfig;
}[] = [
  // De menor a mayor (1.6). Los ids no cambian: los ajustes guardados siguen valiendo.
  { id: '15-3', config: { workMin: 15, breakMin: 3, rounds: PRESET_ROUNDS } },
  { id: '25-5', config: { workMin: 25, breakMin: 5, rounds: PRESET_ROUNDS } },
  { id: '50-10', config: { workMin: 50, breakMin: 10, rounds: PRESET_ROUNDS } },
  { id: '90-15', config: { workMin: 90, breakMin: 15, rounds: PRESET_ROUNDS } },
];

/** Preajuste por defecto (el clásico 25/5), independiente del orden en pantalla. */
export const DEFAULT_CYCLE_PRESET: Exclude<CyclePresetId, 'custom'> = '25-5';

export const CYCLE_PRESET_IDS: readonly CyclePresetId[] = [...CYCLE_PRESETS.map((p) => p.id), 'custom'];

/** Límites de «Personalizado». Los minutos usan los mismos escalones que el gesto de deslizar. */
export const CYCLE_LIMITS = {
  minMinutes: DURATION_STEPS_MIN[0] as number,
  maxMinutes: DURATION_STEPS_MIN[DURATION_STEPS_MIN.length - 1] as number,
  minRounds: 1,
  maxRounds: 12,
} as const;

export const DEFAULT_CUSTOM_CYCLE: CycleConfig = Object.freeze({ workMin: 30, breakMin: 5, rounds: 4 });

/** ¿Lleva descanso la última ronda? (ver comentario de arriba) */
export const FINAL_BREAK = false;

/** Configuración efectiva de un preajuste (o de los valores personalizados). */
export function cycleConfigFor(preset: CyclePresetId, custom: CycleConfig): CycleConfig {
  if (preset === 'custom') return sanitizeCycleConfig(custom);
  return (
    CYCLE_PRESETS.find((p) => p.id === preset)?.config ??
    (CYCLE_PRESETS.find((p) => p.id === DEFAULT_CYCLE_PRESET) as { config: CycleConfig }).config
  );
}

/**
 * Corrige una configuración leída de fuera: minutos al escalón válido más
 * cercano (1–180) y rondas enteras entre 1 y 12.
 */
export function sanitizeCycleConfig(raw: unknown, fallback: CycleConfig = DEFAULT_CUSTOM_CYCLE): CycleConfig {
  if (typeof raw !== 'object' || raw === null) return fallback;
  const r = raw as Record<string, unknown>;
  return {
    workMin: snapMinutes(r.workMin, fallback.workMin),
    breakMin: snapMinutes(r.breakMin, fallback.breakMin),
    rounds: clampRounds(r.rounds, fallback.rounds),
  };
}

/**
 * Paso de un stepper de minutos: avanza `delta` escalones (1–10 de 1 en 1,
 * 15–60 de 5 en 5, 75–180 de 15 en 15) sin salirse del rango.
 */
export function stepMinutes(minutes: number, delta: number): number {
  return stepToDuration(nearestStepIndex(minutes * MINUTE_MS) + delta) / MINUTE_MS;
}

/** Paso del stepper de rondas (1–12). */
export function stepRounds(rounds: number, delta: number): number {
  return clampRounds(rounds + delta, CYCLE_LIMITS.minRounds);
}

/** Plan de tramos (trabajo, descanso, trabajo...) de una configuración. */
export function planForCycle(config: CycleConfig): SessionPlan {
  const c = sanitizeCycleConfig(config);
  const segments: SessionSegment[] = [];
  for (let round = 0; round < c.rounds; round++) {
    segments.push({ kind: 'focus', durationMs: c.workMin * MINUTE_MS });
    const last = round === c.rounds - 1;
    if (!last || FINAL_BREAK) segments.push({ kind: 'break', durationMs: c.breakMin * MINUTE_MS });
  }
  return { segments, repeat: false };
}

/** Ronda (empezando en 1) a la que pertenece el tramo `index` de un plan de ciclos. */
export function roundOfSegment(plan: SessionPlan, index: number): number {
  let round = 0;
  for (let i = 0; i <= index && i < plan.segments.length; i++) {
    if (plan.segments[i]?.kind === 'focus') round++;
  }
  return Math.max(1, round);
}

/** Número de rondas de un plan (= tramos de trabajo). */
export function roundsInPlan(plan: SessionPlan): number {
  return plan.segments.filter((s) => s.kind === 'focus').length;
}

function snapMinutes(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return fallback;
  return stepMinutes(v, 0);
}

function clampRounds(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(CYCLE_LIMITS.maxRounds, Math.max(CYCLE_LIMITS.minRounds, Math.round(v)));
}
