/**
 * Regresión 1.5.1: arena tras dar la vuelta con el bulbo lleno.
 *
 * El fallo que vio Sebastián en un ciclo corto: tras el giro de cambio de
 * fase, el bulbo de arriba (lleno) se llenaba de rayas horizontales y un
 * enrejado en V durante ~1 s, unos granos bajaban «en bloque» bajo el cuello
 * y el chorro salía a trompicones (esto último, solo en el navegador: a pocos
 * fps). Estos tests fijan cada causa.
 */
import { describe, expect, it } from 'vitest';
import {
  CLASSIC_MODEL,
  GRAVITY_DOWN,
  PARTICLE_FALL,
  SAND,
  SandSimulation,
  StreamParticles,
  flowBudget,
  nominalFlowRate,
  syncSandToTarget,
  targetSourceGrains,
} from '../src';

const makeSim = (cols = 81) =>
  new SandSimulation({
    profile: CLASSIC_MODEL.profile,
    cols,
    slideChance: SAND.slideChance,
    fillRatio: SAND.fillRatio,
    seed: 7,
  });

/** Toda la arena abajo y asentada; luego, la vuelta (como al cambiar de fase). */
function fullTopAfterTurn(sim: SandSimulation): void {
  sim.arrange(0, sim.totalGrains, GRAVITY_DOWN, { crater: 0.35 });
  for (let i = 0; i < 400 && !sim.isSettled; i++) sim.step(GRAVITY_DOWN);
  sim.rotateHalfTurn();
}

/**
 * Huecos DENTRO de la masa del bulbo de arriba: celdas vacías con un grano
 * justo encima y otro justo debajo. Son las «rayas»: una masa que cae entera
 * no debería tener ninguno.
 */
function holesInsideMass(sim: SandSimulation): number {
  const { cols, cells, mask, gateRow } = sim;
  let holes = 0;
  for (let row = 1; row < gateRow - 1; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (mask[i] !== 1 || cells[i] !== 0) continue;
      if (cells[i - cols] !== 0 && cells[i + cols] !== 0) holes++;
    }
  }
  return holes;
}

describe('masa de arena que cae tras dar la vuelta', () => {
  it('baja entera, sin abrirse en filas (rayas / enrejado)', () => {
    const sim = makeSim();
    fullTopAfterTurn(sim);
    let worst = 0;
    for (let step = 0; step < 120; step++) {
      sim.step(GRAVITY_DOWN);
      worst = Math.max(worst, holesInsideMass(sim));
    }
    // Antes del arreglo había cientos de huecos (filas alternas). Ahora solo
    // puede haber alguno suelto donde un grano rueda en diagonal.
    expect(worst).toBeLessThan(sim.totalGrains * 0.01);
  });

  it('se asienta pronto y conserva todos los granos', () => {
    const sim = makeSim();
    fullTopAfterTurn(sim);
    const total = sim.topCount + sim.bottomCount;
    let steps = 0;
    while (!sim.isSettled && steps < 2000) {
      sim.step(GRAVITY_DOWN);
      steps++;
    }
    expect(sim.isSettled).toBe(true);
    expect(sim.countGrains()).toEqual({ top: sim.topCount, bottom: sim.bottomCount });
    expect(sim.topCount + sim.bottomCount).toBe(total);
    // Con 2 pasos por fotograma, menos de ~1,5 s.
    expect(steps).toBeLessThan(180);
  });
});

describe('flushSource (fin de una fase)', () => {
  it('pasa abajo todos los granos rezagados, sin perder ninguno', () => {
    const sim = makeSim();
    sim.arrange(60, sim.totalGrains - 60, GRAVITY_DOWN, { crater: 0.35 });
    const total = sim.totalGrains;
    const moved = sim.flushSource(GRAVITY_DOWN);
    expect(moved).toBe(60);
    expect(sim.topCount).toBe(0);
    expect(sim.countGrains()).toEqual({ top: 0, bottom: total });
  });

  it('tras un ciclo real no deja granos colgando bajo el cuello al dar la vuelta', () => {
    const sim = makeSim();
    const g = GRAVITY_DOWN;
    sim.arrange(sim.totalGrains, 0, g, { crater: 0.35 });
    const initial = sim.topCount;
    const durationMs = 20_000;
    const budget = flowBudget(initial, durationMs, sim.totalGrains);
    // Fase entera a 60 fps, como useSandEngine.
    for (let t = 1000 / 60; t < durationMs; t += 1000 / 60) {
      syncSandToTarget(sim, targetSourceGrains(initial, durationMs - t, durationMs), g, budget);
      sim.step(g);
      sim.step(g);
    }
    // Siempre quedan algunos rezagados en el embudo...
    expect(sim.topCount).toBeGreaterThan(0);
    sim.flushSource(g);
    sim.rotateHalfTurn();
    // ...pero tras pasarlos, el bulbo de abajo empieza vacío.
    expect(sim.bottomCount).toBe(0);
  });
});

describe('caudal alto: ni «reinicios» ni chorro a trompicones', () => {
  it('un retraso de 1,2 s (el giro) se recupera fluyendo, sin recolocar', () => {
    const sim = makeSim();
    fullTopAfterTurn(sim);
    const initial = sim.topCount;
    const durationMs = 60_000; // bulbo lleno en un minuto
    const budget = flowBudget(initial, durationMs, sim.totalGrains);
    let elapsed = 1200; // giro + caída de la masa: el tiempo ya corre
    const results = new Set<string>();
    for (let f = 0; f < 240; f++) {
      elapsed += 1000 / 60;
      const target = targetSourceGrains(initial, durationMs - elapsed, durationMs);
      results.add(syncSandToTarget(sim, target, GRAVITY_DOWN, budget));
      sim.step(GRAVITY_DOWN);
      sim.step(GRAVITY_DOWN);
    }
    expect(results.has('teleported')).toBe(false);
    // Y al final va al día con el temporizador.
    const target = targetSourceGrains(initial, durationMs - elapsed, durationMs);
    expect(Math.abs(sim.topCount - target)).toBeLessThan(10);
  });

  it('flowBudget no cambia nada con caudales normales', () => {
    const total = 10_000;
    // 25 min con dos tercios del bulbo: ~4 granos/s.
    expect(flowBudget(6600, 25 * 60_000, total)).toEqual({ maxPerFrame: 8, teleportThreshold: 400 });
    expect(nominalFlowRate(6000, 60_000)).toBe(100);
    expect(nominalFlowRate(100, 0)).toBe(0);
  });

  it('el chorro no depende de los fps (a 12–30 fps sale igual que a 60)', () => {
    /** Granos emitidos en 3 s y mayor hueco vertical (celdas) entre granos del chorro. */
    const run = (fps: number): { emitted: number; gap: number } => {
      const sim = makeSim(61);
      sim.arrange(Math.round(sim.totalGrains * 0.8), sim.totalGrains - Math.round(sim.totalGrains * 0.8));
      const p = new StreamParticles({ capacity: 360, seed: 7 });
      let gap = 0;
      for (let f = 1; f <= 3 * fps; f++) {
        p.update(sim, { dt: 1 / fps, emitting: true, intensity: 1, gravity: GRAVITY_DOWN, calm: false });
        // Tramo alto del chorro (6 celdas bajo el cuello), donde los
        // «paquetes» por fotograma se notaban más.
        const ys: number[] = [];
        for (let i = 0; i < p.count; i++) {
          const dy = p.y[i]! - sim.gateRow;
          if (p.kind[i] === PARTICLE_FALL && dy > 0 && dy < 6) ys.push(dy);
        }
        ys.sort((a, b) => a - b);
        let g = 0;
        for (let i = 1; i < ys.length; i++) g = Math.max(g, ys[i]! - ys[i - 1]!);
        if (ys.length > 4) gap = Math.max(gap, g);
      }
      return { emitted: p.emitted, gap };
    };
    const at60 = run(60);
    // Antes: a 20 fps el hueco crecía ~45 % (granos a paquetes) y a 12 fps
    // salía casi la mitad de arena (el paso se recortaba a 1/20 s).
    for (const fps of [30, 20, 12]) {
      const r = run(fps);
      expect(Math.abs(r.emitted - at60.emitted) / at60.emitted).toBeLessThan(0.05);
      expect(r.gap).toBeLessThan(at60.gap * 1.1);
    }
  });
});
