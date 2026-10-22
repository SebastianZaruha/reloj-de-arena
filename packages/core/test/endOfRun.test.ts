/**
 * Casos extremos al FINAL de la cuenta: progreso 0, ~0.99, 1 y más allá.
 * Aquí es donde la arena casi se ha acabado y la geometría es más delicada
 * (montones casi vacíos, chorro sin arena...), así que lo cubrimos a fondo.
 */
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_MODEL,
  createTimer,
  GRAVITY_DOWN,
  normalize,
  SandSimulation,
  snapshot,
  start,
  syncSandToTarget,
  targetSourceGrains,
} from '../src';

const make = () => new SandSimulation({ profile: CLASSIC_MODEL.profile, cols: 61, seed: 3 });

/** Ejecuta la simulación como lo hace el bucle de animación. */
function runFrames(sim: SandSimulation, target: number, frames: number) {
  for (let f = 0; f < frames; f++) {
    syncSandToTarget(sim, target, GRAVITY_DOWN, { maxPerFrame: 8 });
    sim.step(GRAVITY_DOWN);
    sim.step(GRAVITY_DOWN);
  }
}

describe('targetSourceGrains en los extremos', () => {
  const D = 60_000;
  it.each([
    ['inicio (progreso 0)', D, 1000],
    ['progreso 0.5', D / 2, 500],
    ['progreso ~0.99', D * 0.01, 10],
    ['casi al final (1 ms)', 1, 1],
    ['final exacto (progreso 1)', 0, 0],
    ['más allá del final', -5_000, 0],
    ['restante mayor que la duración', D * 2, 1000],
  ])('%s', (_name, remaining, expected) => {
    expect(targetSourceGrains(1000, remaining, D)).toBe(expected);
  });

  it('nunca devuelve NaN ni negativos con entradas raras', () => {
    for (const [initial, remaining, duration] of [
      [1000, NaN, 60_000],
      [1000, 1000, 0],
      [1000, 1000, -1],
      [0, 1000, 60_000],
      [1000, Infinity, 60_000],
      [1000, -Infinity, 60_000],
    ] as const) {
      const v = targetSourceGrains(initial, remaining, duration);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('simulación al terminar', () => {
  it('vacía el bulbo superior por completo y conserva todos los granos', () => {
    const sim = make();
    const total = sim.totalGrains;
    sim.arrange(300, total - 300);
    // ~0.99 → quedan 3 granos; luego 0; luego "más allá" (sigue en 0).
    runFrames(sim, 3, 200);
    expect(sim.topCount).toBe(3);
    runFrames(sim, 0, 200);
    expect(sim.topCount).toBe(0);
    runFrames(sim, 0, 50);
    expect(sim.countGrains()).toEqual({ top: 0, bottom: total });
  });

  it('sin arena arriba no hay chorro ni punto de caída que dibujar', () => {
    const sim = make();
    sim.arrange(0, sim.totalGrains);
    runFrames(sim, 0, 30);
    expect(sim.hasGrainAtNeck(GRAVITY_DOWN)).toBe(false);
    // El punto de caída es una celda válida o -1, nunca NaN.
    const cell = sim.landingCell(GRAVITY_DOWN);
    expect(Number.isInteger(cell)).toBe(true);
    expect(cell).toBeLessThan(sim.cols * sim.rows);
  });

  it('landingCell acepta gravedades degeneradas sin romperse', () => {
    const sim = make();
    sim.arrange(100, 100);
    for (const g of [
      { x: 0, y: 0 },
      { x: NaN, y: 1 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 1e-12, y: 1e-12 },
    ]) {
      const cell = sim.landingCell(g);
      expect(Number.isInteger(cell)).toBe(true);
      expect(cell).toBeGreaterThanOrEqual(-1);
      expect(cell).toBeLessThan(sim.cols * sim.rows);
    }
    expect(sim.landingPoint({ x: 0, y: 0 })).toBeNull();
  });

  it('todas las sesiones seguidas terminan igual de limpias', () => {
    const sim = make();
    for (let session = 0; session < 3; session++) {
      sim.arrange(400, sim.totalGrains - 400);
      for (const left of [400, 200, 50, 4, 1, 0]) runFrames(sim, left, 60);
      expect(sim.topCount).toBe(0);
      expect(sim.bottomCount).toBe(sim.totalGrains);
    }
  });

  it('la foto del temporizador al final y más allá es estable', () => {
    const t = start(createTimer(60_000), 1_000);
    for (const now of [61_000, 61_001, 1e12]) {
      const s = snapshot(t, now);
      expect(s.status).toBe('finished');
      expect(s.remainingMs).toBe(0);
      expect(s.progress).toBe(1);
    }
    const s = snapshot(t, 60_400); // progreso ~0.99
    expect(s.status).toBe('running');
    expect(s.progress).toBeCloseTo(0.99, 2);
  });

  it('normalize devuelve el mismo objeto si ya es unitario (sin basura por fotograma)', () => {
    expect(normalize(GRAVITY_DOWN)).toBe(GRAVITY_DOWN);
    expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
  });
});

describe('simulación recreada con el tiempo corriendo', () => {
  it('una simulación vacía se rellena con su arena nominal (no se queda vacía)', () => {
    const sim = make();
    expect(sim.topCount + sim.bottomCount).toBe(0);
    const target = Math.round(sim.totalGrains * 0.4);
    expect(syncSandToTarget(sim, target)).toBe('teleported');
    expect(sim.topCount).toBe(target);
    expect(sim.topCount + sim.bottomCount).toBe(sim.totalGrains);
  });
});
