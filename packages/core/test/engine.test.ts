import { describe, expect, it } from 'vitest';
import {
  createTimer,
  elapsedAt,
  ManualClock,
  pause,
  restart,
  resume,
  setDuration,
  snapshot,
  start,
  systemClock,
  tick,
  toggle,
} from '../src';

const MIN = 60_000;

describe('motor del temporizador', () => {
  it('crea un temporizador en reposo', () => {
    const t = createTimer(5 * MIN);
    expect(t).toEqual({ status: 'idle', durationMs: 5 * MIN, startedAt: null, accumulatedMs: 0 });
    expect(snapshot(t, 123).remainingMs).toBe(5 * MIN);
  });

  it('rechaza duraciones no válidas', () => {
    expect(() => createTimer(0)).toThrow(RangeError);
    expect(() => createTimer(-1)).toThrow(RangeError);
    expect(() => createTimer(Number.NaN)).toThrow(RangeError);
  });

  it('calcula el tiempo a partir de marcas de tiempo (sin ticks)', () => {
    const clock = new ManualClock(1_000);
    let t = start(createTimer(MIN), clock.now());
    clock.advance(20_000);
    expect(elapsedAt(t, clock.now())).toBe(20_000);
    // Simulamos que la app pasa 30 s en segundo plano sin ningún tick.
    clock.advance(30_000);
    const snap = snapshot(t, clock.now());
    expect(snap.remainingMs).toBe(10_000);
    expect(snap.progress).toBeCloseTo(50 / 60);
    t = tick(t, clock.now());
    expect(t.status).toBe('running');
  });

  it('pausa y reanuda conservando el tiempo acumulado', () => {
    const clock = new ManualClock(0);
    let t = start(createTimer(MIN), clock.now());
    clock.advance(10_000);
    t = pause(t, clock.now());
    expect(t.status).toBe('paused');
    clock.advance(999_999); // en pausa el tiempo no cuenta
    expect(snapshot(t, clock.now()).elapsedMs).toBe(10_000);
    t = resume(t, clock.now());
    clock.advance(5_000);
    expect(snapshot(t, clock.now()).elapsedMs).toBe(15_000);
  });

  it('termina al agotarse el tiempo', () => {
    const clock = new ManualClock(0);
    let t = start(createTimer(MIN), 0);
    clock.advance(MIN + 5);
    expect(snapshot(t, clock.now()).status).toBe('finished');
    expect(snapshot(t, clock.now()).remainingMs).toBe(0);
    t = tick(t, clock.now());
    expect(t.status).toBe('finished');
    expect(snapshot(t, clock.now()).progress).toBe(1);
  });

  it('pausar justo al final da un temporizador terminado', () => {
    const t = pause(start(createTimer(MIN), 0), MIN);
    expect(t.status).toBe('finished');
  });

  it('toggle recorre el ciclo idle → running → paused → running y reinicia al terminar', () => {
    let t = createTimer(MIN);
    t = toggle(t, 0);
    expect(t.status).toBe('running');
    t = toggle(t, 1_000);
    expect(t.status).toBe('paused');
    t = toggle(t, 2_000);
    expect(t.status).toBe('running');
    t = tick(t, 2_000 + MIN);
    expect(t.status).toBe('finished');
    t = toggle(t, 0);
    expect(t.status).toBe('idle');
    expect(t.durationMs).toBe(MIN);
  });

  it('ignora acciones que no corresponden al estado', () => {
    const idle = createTimer(MIN);
    expect(pause(idle, 0)).toBe(idle);
    expect(resume(idle, 0)).toBe(idle);
    expect(tick(idle, 0)).toBe(idle);
    const running = start(idle, 0);
    expect(start(running, 10)).toBe(running);
  });

  it('restart vuelve a idle con la misma duración', () => {
    const t = restart(pause(start(createTimer(3 * MIN), 0), 1_000));
    expect(t).toEqual(createTimer(3 * MIN));
  });

  it('setDuration solo cambia la duración cuando no está corriendo', () => {
    const running = start(createTimer(MIN), 0);
    expect(setDuration(running, 2 * MIN)).toBe(running);
    const paused = pause(running, 100);
    expect(setDuration(paused, 2 * MIN)).toEqual(createTimer(2 * MIN));
  });

  it('es robusto si el reloj del sistema retrocede', () => {
    const t = start(createTimer(MIN), 10_000);
    expect(elapsedAt(t, 5_000)).toBe(0);
  });

  it('el reloj del sistema devuelve la hora actual', () => {
    const before = Date.now();
    const now = systemClock.now();
    expect(now).toBeGreaterThanOrEqual(before);
    const c = new ManualClock();
    c.set(42);
    expect(c.now()).toBe(42);
  });
});
