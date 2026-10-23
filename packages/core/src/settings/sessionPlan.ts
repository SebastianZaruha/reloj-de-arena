/**
 * Del ajuste guardado al plan que recorre el motor de sesión.
 *
 *   Sesión única → un tramo con la última duración elegida.
 *   Ciclos       → trabajo/descanso según el preajuste o «Personalizado».
 */
import { cycleConfigFor, planForCycle, type CycleConfig } from '../session/cycles';
import { singleSegmentPlan, type SessionPlan } from '../session/plan';
import type { Settings } from './settings';

type PlanSettings = Pick<Settings, 'sessionMode' | 'lastDurationMs' | 'cyclePreset' | 'customCycle'>;

/** Configuración de ciclo activa según los ajustes. */
export function activeCycleConfig(settings: Pick<Settings, 'cyclePreset' | 'customCycle'>): CycleConfig {
  return cycleConfigFor(settings.cyclePreset, settings.customCycle);
}

/** Plan de sesión que corresponde a los ajustes. */
export function sessionPlanFor(settings: PlanSettings): SessionPlan {
  return settings.sessionMode === 'cycles'
    ? planForCycle(activeCycleConfig(settings))
    : singleSegmentPlan(settings.lastDurationMs);
}

/** ¿Dos planes son iguales tramo a tramo? (para no reiniciar sin motivo) */
export function samePlan(a: SessionPlan, b: SessionPlan): boolean {
  if (a === b) return true;
  if (a.repeat !== b.repeat || a.segments.length !== b.segments.length) return false;
  return a.segments.every(
    (s, i) => s.kind === b.segments[i]?.kind && s.durationMs === b.segments[i]?.durationMs,
  );
}
