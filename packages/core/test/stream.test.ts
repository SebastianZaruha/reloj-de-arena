/**
 * Partículas del chorro: deterministas, sin NaN, con memoria fija y con el
 * comportamiento visual esperado (acelera, salpica, se corta al final).
 */
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_MODEL,
  GRAVITY_DOWN,
  PARTICLE_FALL,
  PARTICLE_HOP,
  PARTICLE_ROLL,
  PARTICLE_SWIRL,
  SandSimulation,
  StreamParticles,
  type StreamInput,
} from '../src';

const makeSim = () => {
  const sim = new SandSimulation({ profile: CLASSIC_MODEL.profile, cols: 61, seed: 3 });
  sim.arrange(Math.round(sim.totalGrains * 0.5), sim.totalGrains - Math.round(sim.totalGrains * 0.5));
  return sim;
};

const input = (over: Partial<StreamInput> = {}): StreamInput => ({
  dt: 1 / 60,
  emitting: true,
  intensity: 1,
  gravity: GRAVITY_DOWN,
  calm: false,
  ...over,
});

function run(p: StreamParticles, sim: SandSimulation, frames: number, inp: StreamInput, kinds?: Set<number>) {
  for (let f = 0; f < frames; f++) {
    p.update(sim, inp);
    for (let i = 0; i < p.count; i++) {
      expect(Number.isFinite(p.x[i]!) && Number.isFinite(p.y[i]!)).toBe(true);
      kinds?.add(p.kind[i]!);
    }
  }
}

describe('StreamParticles', () => {
  it('es determinista con la misma semilla', () => {
    const a = new StreamParticles({ seed: 5 });
    const b = new StreamParticles({ seed: 5 });
    const sa = makeSim();
    const sb = makeSim();
    run(a, sa, 90, input());
    run(b, sb, 90, input());
    expect(a.count).toBe(b.count);
    expect(Array.from(a.x.subarray(0, a.count))).toEqual(Array.from(b.x.subarray(0, b.count)));
  });

  it('usa memoria fija: nunca supera su capacidad ni cambia sus buffers', () => {
    const p = new StreamParticles({ capacity: 64, seed: 1 });
    const buf = p.x;
    run(p, makeSim(), 600, input({ intensity: 1 }));
    expect(p.count).toBeLessThanOrEqual(64);
    expect(p.x).toBe(buf);
  });

  it('produce chorro, remolino, salpicaduras y granos rodando', () => {
    const p = new StreamParticles({ seed: 2 });
    const kinds = new Set<number>();
    run(p, makeSim(), 600, input(), kinds);
    expect(kinds.has(PARTICLE_FALL)).toBe(true);
    expect(kinds.has(PARTICLE_SWIRL)).toBe(true);
    expect(kinds.has(PARTICLE_HOP)).toBe(true);
    expect(kinds.has(PARTICLE_ROLL)).toBe(true);
  });

  it('los granos aceleran al caer (más rápidos abajo que junto al cuello)', () => {
    const p = new StreamParticles({ seed: 4 });
    const sim = makeSim();
    run(p, sim, 120, input());
    let near = 0;
    let nearN = 0;
    let far = 0;
    let farN = 0;
    for (let i = 0; i < p.count; i++) {
      if (p.kind[i] !== PARTICLE_FALL) continue;
      const depth = p.y[i]! - sim.gateRow;
      if (depth > 0 && depth < 8) {
        near += p.vy[i]!;
        nearN++;
      } else if (depth > 20) {
        far += p.vy[i]!;
        farN++;
      }
    }
    expect(nearN).toBeGreaterThan(0);
    expect(farN).toBeGreaterThan(0);
    expect(far / farN).toBeGreaterThan((near / nearN) * 2);
  });

  it('al cortarse el flujo, los últimos granos terminan de caer y el chorro desaparece', () => {
    const p = new StreamParticles({ seed: 3 });
    const sim = makeSim();
    run(p, sim, 120, input());
    expect(p.active).toBe(true);
    run(p, sim, 240, input({ emitting: false }));
    expect(p.count).toBe(0);
  });

  it('el chorro adelgaza cuando queda poca arena arriba', () => {
    const full = new StreamParticles({ seed: 9 });
    const thin = new StreamParticles({ seed: 9 });
    const simFull = makeSim();
    const simThin = new SandSimulation({ profile: CLASSIC_MODEL.profile, cols: 61, seed: 3 });
    simThin.arrange(8, simThin.totalGrains - 8);
    run(full, simFull, 60, input());
    run(thin, simThin, 60, input());
    expect(thin.count).toBeLessThan(full.count * 0.5);
  });

  it('versión calmada (reducir movimiento): menos granos y sin salpicaduras', () => {
    const p = new StreamParticles({ seed: 2 });
    const kinds = new Set<number>();
    run(p, makeSim(), 400, input({ calm: true }), kinds);
    expect(kinds.has(PARTICLE_HOP)).toBe(false);
    expect(kinds.has(PARTICLE_SWIRL)).toBe(false);
  });

  it('entradas raras no producen NaN ni rompen nada', () => {
    const p = new StreamParticles({ seed: 2 });
    const sim = makeSim();
    for (const over of [
      { dt: NaN },
      { dt: -1 },
      { dt: 10 },
      { intensity: NaN },
      { gravity: { x: 0, y: 0 } },
      { gravity: { x: NaN, y: 1 } },
      { gravity: { x: 1, y: 0 } },
      { gravity: { x: 0, y: -1 } },
    ]) {
      run(p, sim, 30, input(over));
    }
    p.reset(1);
    expect(p.count).toBe(0);
  });
});
