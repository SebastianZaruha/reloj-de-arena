import { describe, expect, it } from 'vitest';
import {
  createTimer,
  decideRecovery,
  MAX_REMOUNTS,
  parseTimer,
  pause,
  RECOVERY_WINDOW_MS,
  serializeTimer,
  start,
} from '../src';

describe('serialización del temporizador', () => {
  it('ida y vuelta conserva el estado (corriendo y en pausa)', () => {
    const running = start(createTimer(5 * 60_000), 1_000);
    expect(parseTimer(serializeTimer(running), 2_000)).toEqual(running);
    const paused = pause(running, 31_000);
    expect(parseTimer(serializeTimer(paused), 40_000)).toEqual(paused);
  });

  it('rechaza datos corruptos o imposibles', () => {
    const now = 10_000;
    for (const bad of [
      'no es json',
      null,
      42,
      { status: 'volando', durationMs: 60_000, accumulatedMs: 0, startedAt: null },
      { status: 'idle', durationMs: NaN, accumulatedMs: 0, startedAt: null },
      { status: 'idle', durationMs: 1, accumulatedMs: 0, startedAt: null },
      { status: 'paused', durationMs: 60_000, accumulatedMs: 90_000, startedAt: null },
      { status: 'running', durationMs: 60_000, accumulatedMs: 0, startedAt: null },
      { status: 'running', durationMs: 60_000, accumulatedMs: 0, startedAt: now + 1 },
    ]) {
      expect(parseTimer(bad, now)).toBeNull();
    }
  });
});

describe('política de recuperación del error boundary', () => {
  const base = { now: 100_000, engineAlive: true, canReload: true, lastReloadAt: null };

  it('remonta con espera creciente y acaba rindiéndose (nunca en bucle)', () => {
    const failures: number[] = [];
    const delays: number[] = [];
    for (let i = 0; i < MAX_REMOUNTS; i++) {
      failures.push(base.now - 10 * i);
      const a = decideRecovery({ ...base, failures });
      expect(a.type).toBe('remount');
      if (a.type === 'remount') delays.push(a.delayMs);
    }
    expect([...delays].sort((x, y) => x - y)).toEqual(delays);
    expect(delays[0]).toBeGreaterThan(0);
    failures.push(base.now);
    expect(decideRecovery({ ...base, failures }).type).toBe('give-up');
  });

  it('olvida los fallos antiguos', () => {
    const old = Array.from({ length: 10 }, () => base.now - RECOVERY_WINDOW_MS - 1);
    expect(decideRecovery({ ...base, failures: [...old, base.now] }).type).toBe('remount');
  });

  it('si el motor ha muerto recarga una vez, y no vuelve a recargar enseguida', () => {
    const dead = { ...base, engineAlive: false, failures: [base.now] };
    expect(decideRecovery(dead).type).toBe('reload');
    expect(decideRecovery({ ...dead, lastReloadAt: base.now - 5_000 }).type).toBe('give-up');
    expect(decideRecovery({ ...dead, canReload: false }).type).toBe('give-up');
  });
});
