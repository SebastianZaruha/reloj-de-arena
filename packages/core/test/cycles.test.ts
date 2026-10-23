import { describe, expect, it } from 'vitest';
import {
  activeCycleConfig,
  CYCLE_LIMITS,
  CYCLE_PRESETS,
  cycleConfigFor,
  DEFAULT_CUSTOM_CYCLE,
  DEFAULT_SETTINGS,
  planForCycle,
  roundOfSegment,
  roundsInPlan,
  samePlan,
  sanitizeCycleConfig,
  sessionPlanFor,
  stepMinutes,
  stepRounds,
} from '../src';

const MIN = 60_000;

describe('ciclos: preajustes y Personalizado', () => {
  it('los preajustes son 25/5, 50/10, 15/3 y 90/15, de 4 rondas', () => {
    expect(CYCLE_PRESETS.map((p) => `${p.config.workMin}/${p.config.breakMin}`)).toEqual([
      '25/5',
      '50/10',
      '15/3',
      '90/15',
    ]);
    expect(CYCLE_PRESETS.every((p) => p.config.rounds === 4)).toBe(true);
  });

  it('Personalizado usa los valores guardados', () => {
    const custom = { workMin: 40, breakMin: 8, rounds: 6 };
    expect(cycleConfigFor('custom', custom)).toEqual(custom);
    expect(cycleConfigFor('50-10', custom)).toEqual({ workMin: 50, breakMin: 10, rounds: 4 });
  });

  it('corrige valores fuera de rango o raros', () => {
    expect(sanitizeCycleConfig({ workMin: 999, breakMin: 0.2, rounds: 40 })).toEqual({
      workMin: CYCLE_LIMITS.maxMinutes,
      breakMin: CYCLE_LIMITS.minMinutes,
      rounds: CYCLE_LIMITS.maxRounds,
    });
    expect(sanitizeCycleConfig({ workMin: 12, breakMin: 'x', rounds: -3 })).toEqual({
      workMin: 10, // 12 no es un escalón: el más cercano es 10 (hay 10 y 15)
      breakMin: DEFAULT_CUSTOM_CYCLE.breakMin,
      rounds: 1,
    });
    expect(sanitizeCycleConfig(null)).toBe(DEFAULT_CUSTOM_CYCLE);
  });

  it('steppers: minutos por escalones (1, 5 o 15) y rondas de 1 a 12', () => {
    expect(stepMinutes(9, 1)).toBe(10);
    expect(stepMinutes(10, 1)).toBe(15);
    expect(stepMinutes(60, 1)).toBe(75);
    expect(stepMinutes(180, 1)).toBe(180);
    expect(stepMinutes(1, -1)).toBe(1);
    expect(stepRounds(12, 1)).toBe(12);
    expect(stepRounds(1, -1)).toBe(1);
    expect(stepRounds(4, 1)).toBe(5);
  });

  it('el plan alterna trabajo y descanso y la última ronda no descansa', () => {
    const plan = planForCycle({ workMin: 25, breakMin: 5, rounds: 4 });
    expect(plan.segments.map((s) => s.kind[0]).join('')).toBe('fbfbfbf');
    expect(plan.segments[0]?.durationMs).toBe(25 * MIN);
    expect(plan.segments[1]?.durationMs).toBe(5 * MIN);
    expect(roundsInPlan(plan)).toBe(4);
    expect([0, 1, 2, 3, 6].map((i) => roundOfSegment(plan, i))).toEqual([1, 1, 2, 2, 4]);
  });

  it('una sola ronda es solo trabajo', () => {
    expect(planForCycle({ workMin: 5, breakMin: 5, rounds: 1 }).segments).toHaveLength(1);
  });
});

describe('plan según los ajustes', () => {
  it('sesión única: un tramo con la última duración', () => {
    const plan = sessionPlanFor({ ...DEFAULT_SETTINGS, lastDurationMs: 15 * MIN });
    expect(plan.segments).toEqual([{ kind: 'focus', durationMs: 15 * MIN }]);
  });

  it('ciclos: el preajuste o Personalizado', () => {
    const s = { ...DEFAULT_SETTINGS, sessionMode: 'cycles' as const, cyclePreset: '15-3' as const };
    expect(sessionPlanFor(s).segments[1]?.durationMs).toBe(3 * MIN);
    expect(activeCycleConfig({ ...s, cyclePreset: 'custom' })).toEqual(DEFAULT_SETTINGS.customCycle);
  });

  it('samePlan compara tramo a tramo', () => {
    const a = planForCycle({ workMin: 25, breakMin: 5, rounds: 2 });
    expect(samePlan(a, planForCycle({ workMin: 25, breakMin: 5, rounds: 2 }))).toBe(true);
    expect(samePlan(a, planForCycle({ workMin: 25, breakMin: 5, rounds: 3 }))).toBe(false);
    expect(samePlan(a, planForCycle({ workMin: 25, breakMin: 10, rounds: 2 }))).toBe(false);
  });
});
