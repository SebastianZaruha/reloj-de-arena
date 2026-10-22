import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DURATION_MS,
  describeDuration,
  DURATION_STEPS_MIN,
  durationFromDrag,
  formatDuration,
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  nearestStepIndex,
  sandLevelForDuration,
  snapDuration,
  stepToDuration,
} from '../src';

const MIN = 60_000;

describe('duraciones', () => {
  it('el rango va de 1 minuto a 3 horas', () => {
    expect(MIN_DURATION_MS).toBe(MIN);
    expect(MAX_DURATION_MS).toBe(180 * MIN);
    expect(DEFAULT_DURATION_MS).toBe(5 * MIN);
  });

  it('los escalones son crecientes y sin duplicados', () => {
    for (let i = 1; i < DURATION_STEPS_MIN.length; i++) {
      expect(DURATION_STEPS_MIN[i]).toBeGreaterThan(DURATION_STEPS_MIN[i - 1] as number);
    }
    expect(DURATION_STEPS_MIN).toContain(25);
    expect(DURATION_STEPS_MIN).toContain(90);
  });

  it('ajusta al escalón más cercano', () => {
    expect(snapDuration(7.4 * MIN)).toBe(7 * MIN);
    expect(snapDuration(13 * MIN)).toBe(15 * MIN);
    expect(snapDuration(0)).toBe(MIN);
    expect(snapDuration(10 * 60 * MIN)).toBe(180 * MIN);
    expect(nearestStepIndex(MIN)).toBe(0);
    expect(stepToDuration(-5)).toBe(MIN);
    expect(stepToDuration(999)).toBe(180 * MIN);
  });

  it('arrastrar hacia arriba aumenta y hacia abajo disminuye', () => {
    expect(durationFromDrag(5 * MIN, 16)).toBe(6 * MIN);
    expect(durationFromDrag(5 * MIN, 15)).toBe(5 * MIN);
    expect(durationFromDrag(5 * MIN, -32)).toBe(3 * MIN);
    expect(durationFromDrag(10 * MIN, 16)).toBe(15 * MIN);
    expect(durationFromDrag(5 * MIN, 100_000)).toBe(180 * MIN);
    expect(durationFromDrag(5 * MIN, -100_000)).toBe(MIN);
    expect(durationFromDrag(5 * MIN, 40, 20)).toBe(7 * MIN);
  });

  it('el nivel de arena crece con la duración (escala logarítmica)', () => {
    expect(sandLevelForDuration(MIN)).toBeCloseTo(0.1);
    expect(sandLevelForDuration(180 * MIN)).toBeCloseTo(1);
    expect(sandLevelForDuration(30 * MIN)).toBeGreaterThan(sandLevelForDuration(10 * MIN));
    expect(sandLevelForDuration(0)).toBeCloseTo(0.1);
    expect(sandLevelForDuration(1e12)).toBeCloseTo(1);
  });

  it('formatea mm:ss y h:mm:ss redondeando hacia arriba', () => {
    expect(formatDuration(5 * MIN)).toBe('05:00');
    expect(formatDuration(59_001)).toBe('01:00');
    expect(formatDuration(1)).toBe('00:01');
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(-50)).toBe('00:00');
    expect(formatDuration(90 * MIN + 5_000)).toBe('1:30:05');
  });

  it('describe duraciones en español para lectores de pantalla', () => {
    expect(describeDuration(MIN)).toBe('1 minuto');
    expect(describeDuration(5 * MIN)).toBe('5 minutos');
    expect(describeDuration(61 * MIN)).toBe('1 hora y 1 minuto');
    expect(describeDuration(2 * 60 * MIN + 3 * MIN + 1_000)).toBe('2 horas, 3 minutos y 1 segundo');
    expect(describeDuration(0)).toBe('0 segundos');
    expect(describeDuration(30_000)).toBe('30 segundos');
  });
});
