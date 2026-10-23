/**
 * Plan de sesión: la lista de tramos (trabajo / descanso) que hay que
 * recorrer. Un temporizador simple es un plan de UN tramo
 * (`singleSegmentPlan`); los ciclos de la fase 3 se construyen con
 * `planForCycle` (cycles.ts) y los recorre el motor de sesión (session.ts).
 */

export type SegmentKind = 'focus' | 'break';

export interface SessionSegment {
  readonly kind: SegmentKind;
  readonly durationMs: number;
}

export interface SessionPlan {
  readonly segments: readonly SessionSegment[];
  /** Si es true, al acabar el último segmento se vuelve al primero. */
  readonly repeat: boolean;
}

/** Plan de un único segmento: el temporizador de la fase 1. */
export function singleSegmentPlan(durationMs: number): SessionPlan {
  return { segments: [{ kind: 'focus', durationMs }], repeat: false };
}

/**
 * Plan genérico de `cycles` pares foco + descanso (incluye el último
 * descanso). La app usa `planForCycle` (cycles.ts), que omite el descanso
 * final; esta función se conserva por compatibilidad y para planes repetitivos.
 * Ejemplo: `cyclePlan(25 min, 5 min, 4)` → foco, descanso, foco, descanso...
 */
export function cyclePlan(focusMs: number, breakMs: number, cycles: number, repeat = false): SessionPlan {
  if (cycles < 1) throw new RangeError('Debe haber al menos un ciclo');
  const segments: SessionSegment[] = [];
  for (let i = 0; i < cycles; i++) {
    segments.push({ kind: 'focus', durationMs: focusMs });
    segments.push({ kind: 'break', durationMs: breakMs });
  }
  return { segments, repeat };
}

/** Índice del siguiente segmento, o null si el plan ha terminado. */
export function nextSegmentIndex(plan: SessionPlan, current: number): number | null {
  const next = current + 1;
  if (next < plan.segments.length) return next;
  return plan.repeat && plan.segments.length > 0 ? 0 : null;
}

/** Duración total del plan (una vuelta). */
export function planTotalMs(plan: SessionPlan): number {
  return plan.segments.reduce((sum, s) => sum + s.durationMs, 0);
}
