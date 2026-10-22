import { describe, expect, it } from 'vitest';
import { cyclePlan, nextSegmentIndex, planTotalMs, singleSegmentPlan } from '../src';

describe('planes de sesión (punto de extensión para ciclos)', () => {
  it('un plan simple tiene un único segmento', () => {
    const plan = singleSegmentPlan(1_000);
    expect(plan.segments).toEqual([{ kind: 'focus', durationMs: 1_000 }]);
    expect(nextSegmentIndex(plan, 0)).toBeNull();
    expect(planTotalMs(plan)).toBe(1_000);
  });

  it('los ciclos alternan foco y descanso', () => {
    const plan = cyclePlan(25, 5, 2);
    expect(plan.segments.map((s) => s.kind)).toEqual(['focus', 'break', 'focus', 'break']);
    expect(planTotalMs(plan)).toBe(60);
    expect(nextSegmentIndex(plan, 0)).toBe(1);
    expect(nextSegmentIndex(plan, 3)).toBeNull();
  });

  it('un plan repetitivo vuelve al principio', () => {
    expect(nextSegmentIndex(cyclePlan(1, 1, 1, true), 1)).toBe(0);
  });

  it('exige al menos un ciclo', () => {
    expect(() => cyclePlan(1, 1, 0)).toThrow(RangeError);
  });
});
