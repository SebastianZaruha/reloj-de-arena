import { describe, expect, it } from 'vitest';
import {
  CLASSIC_MODEL,
  createRng,
  SandSimulation,
  syncSandToTarget,
  targetSourceGrains,
  toneFor,
} from '../src';

const make = (cols = 41, seed = 7) => new SandSimulation({ profile: CLASSIC_MODEL.profile, cols, seed });

/** Altura (fila) de la superficie de la arena en una columna del bulbo inferior. */
function surfaceRow(sim: SandSimulation, col: number): number {
  for (let row = sim.gateRow + 1; row < sim.rows; row++) {
    if (sim.cells[row * sim.cols + col] !== 0) return row;
  }
  return sim.rows;
}

describe('simulación de arena', () => {
  it('construye una rejilla impar con cuello cerrado y capacidad simétrica', () => {
    const sim = make(40);
    expect(sim.cols % 2).toBe(1);
    expect(sim.rows % 2).toBe(1);
    expect(sim.gateCols.length).toBeGreaterThan(0);
    for (const col of sim.gateCols) expect(sim.mask[sim.gateRow * sim.cols + col]).toBe(0);
    expect(sim.capacity.top).toBe(sim.capacity.bottom);
    expect(sim.totalGrains).toBeLessThan(sim.capacity.top);
    expect(sim.bulbOf(0)).toBe('top');
    expect(sim.bulbOf(sim.gateRow)).toBeNull();
    expect(sim.bulbOf(sim.rows - 1)).toBe('bottom');
  });

  it('arrange coloca exactamente los granos pedidos', () => {
    const sim = make();
    sim.arrange(300, 200);
    expect(sim.countGrains()).toEqual({ top: 300, bottom: 200 });
    expect(sim.topCount).toBe(300);
    expect(sim.bottomCount).toBe(200);
    sim.arrange(1e9, -5);
    expect(sim.topCount).toBe(sim.capacity.top);
    expect(sim.bottomCount).toBe(0);
  });

  it('conserva la masa al simular y la arena acaba en reposo', () => {
    const sim = make();
    sim.arrange(400, 100);
    let steps = 0;
    while (!sim.isSettled && steps < 5_000) {
      sim.step();
      steps++;
    }
    expect(sim.isSettled).toBe(true);
    expect(sim.countGrains()).toEqual({ top: 400, bottom: 100 });
    // Un paso más en reposo no mueve nada.
    expect(sim.step()).toBe(0);
  });

  it('la arena cae: un grano suelto llega al fondo', () => {
    const sim = make();
    sim.clear();
    const col = sim.centerCol;
    const row = sim.gateRow + 2;
    sim.cells[row * sim.cols + col] = 9;
    // Forzamos a que se procese despertándolo con una transferencia vacía.
    sim.arrange(0, 1);
    for (let i = 0; i < 500; i++) sim.step();
    const { bottom } = sim.countGrains();
    expect(bottom).toBe(1);
    const idx = sim.cells.findIndex((v) => v !== 0);
    expect(Math.floor(idx / sim.cols)).toBeGreaterThan(sim.rows - 6);
  });

  it('transfer pasa granos por el cuello al ritmo pedido y forma un montón', () => {
    const sim = make();
    sim.arrange(300, 0);
    let moved = 0;
    for (let i = 0; i < 400; i++) {
      moved += sim.transfer(1);
      sim.step();
      sim.step();
    }
    expect(moved).toBeGreaterThan(150);
    expect(sim.topCount + sim.bottomCount).toBe(300);
    expect(sim.countGrains()).toEqual({ top: sim.topCount, bottom: sim.bottomCount });
    // El montón es más alto en el centro que en los lados.
    expect(surfaceRow(sim, sim.centerCol)).toBeLessThan(surfaceRow(sim, 3));
  });

  it('al fluir no quedan huecos dentro de la arena (la columna baja en bloque)', () => {
    const sim = make(61);
    sim.arrange(600, 0, undefined, { crater: 0.35 });
    const holes = () => {
      let h = 0;
      for (let i = sim.cols; i < sim.gateRow * sim.cols; i++) {
        if (sim.mask[i] === 1 && sim.cells[i] === 0 && sim.cells[i - sim.cols] !== 0) h++;
      }
      return h;
    };
    for (let f = 0; f < 150; f++) {
      sim.transfer(1);
      sim.step();
      sim.step();
      // Con las avalanchas (rozamiento estático) puede quedar, durante UN
      // paso, un hueco bajo un grano que justo ha empezado a rodar.
      expect(holes()).toBeLessThanOrEqual(3);
    }
    for (let i = 0; i < 400 && !sim.isSettled; i++) sim.step();
    expect(holes()).toBe(0);
  });

  it('no fluye con el reloj tumbado y fluye hacia arriba si está invertido', () => {
    const sim = make();
    sim.arrange(200, 200);
    expect(sim.transfer(5, { x: 1, y: 0 })).toBe(0);
    expect(sim.landingPoint({ x: 1, y: 0 })).toBeNull();
    expect(sim.hasGrainAtNeck({ x: 1, y: 0 })).toBe(false);
    for (let i = 0; i < 300; i++) sim.step({ x: 0, y: -1 });
    expect(sim.hasGrainAtNeck({ x: 0, y: -1 })).toBe(true);
    expect(sim.transfer(3, { x: 0, y: -1 })).toBe(3);
    expect(sim.topCount).toBe(203);
  });

  it('una gravedad inclinada inclina la superficie', () => {
    const sim = make(61);
    sim.arrange(0, 700);
    const g = { x: 0.6, y: 0.8 };
    for (let i = 0; i < 3_000 && !(i > 10 && sim.isSettled); i++) sim.step(g);
    const left = surfaceRow(sim, 12);
    const right = surfaceRow(sim, sim.cols - 13);
    // Con la gravedad hacia la derecha, la arena se acumula a la derecha.
    expect(right).toBeLessThan(left);
    expect(sim.countGrains().bottom).toBe(700);
  });

  it('landingPoint apunta a la cima del montón', () => {
    const sim = make();
    sim.arrange(100, 0);
    const empty = sim.landingPoint();
    expect(empty).not.toBeNull();
    sim.arrange(100, 200);
    const pile = sim.landingPoint();
    expect(pile && empty && pile.row < empty.row).toBe(true);
    expect(sim.hasGrainAtNeck()).toBe(true);
  });

  it('transfer se detiene si no hay granos o el bulbo receptor está lleno', () => {
    const sim = make();
    sim.arrange(0, 50);
    expect(sim.transfer(10)).toBe(0);
    sim.arrange(10, sim.capacity.bottom);
    expect(sim.transfer(1)).toBe(0);
  });

  it('el resultado es reproducible con la misma semilla', () => {
    const run = () => {
      const sim = make(41, 99);
      sim.arrange(200, 0);
      for (let i = 0; i < 100; i++) {
        sim.transfer(1);
        sim.step();
      }
      return Array.from(sim.cells).join(',');
    };
    expect(run()).toBe(run());
  });

  it('los tonos son estables y nunca 0', () => {
    for (let i = 0; i < 1000; i++) {
      const t = toneFor(i);
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(255);
    }
    expect(toneFor(5, 3)).toBe(toneFor(5, 3));
    const rng = createRng(1);
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });

  it('el contador de pasos se recicla sin errores', () => {
    const sim = make(21);
    sim.arrange(50, 0);
    for (let i = 0; i < 70_000; i++) {
      sim.transfer(1);
      sim.step();
      if (sim.topCount === 0) sim.arrange(50, 0);
    }
    expect(sim.topCount + sim.bottomCount).toBe(50);
  });
});

describe('controlador de flujo', () => {
  it('calcula los granos objetivo según el tiempo restante', () => {
    expect(targetSourceGrains(100, 60_000, 60_000)).toBe(100);
    expect(targetSourceGrains(100, 30_000, 60_000)).toBe(50);
    expect(targetSourceGrains(100, 1, 60_000)).toBe(1);
    expect(targetSourceGrains(100, 0, 60_000)).toBe(0);
    expect(targetSourceGrains(100, 5, 0)).toBe(0);
  });

  it('fluye poco a poco y se teletransporta ante grandes diferencias', () => {
    const sim = make();
    sim.arrange(400, 0);
    expect(syncSandToTarget(sim, 400)).toBe('idle');
    expect(syncSandToTarget(sim, 398)).toBe('flowing');
    expect(sim.topCount).toBe(398);
    expect(syncSandToTarget(sim, 100)).toBe('teleported');
    expect(sim.topCount).toBe(100);
    expect(sim.bottomCount).toBe(300);
    // Pedir más arena arriba (reinicio) también recoloca.
    expect(syncSandToTarget(sim, 350, undefined, { crater: 0 })).toBe('teleported');
    expect(sim.topCount).toBe(350);
  });

  it('el emisor es siempre el bulbo de arriba; tumbado o boca abajo no fluye', () => {
    const sim = make();
    sim.arrange(300, 100);
    // Boca abajo: no pasa arena (el giro de 180° lo gestiona rotateHalfTurn).
    expect(syncSandToTarget(sim, 295, { x: 0, y: -1 })).toBe('idle');
    // Tumbado (90°): tampoco.
    expect(syncSandToTarget(sim, 295, { x: 1, y: 0 })).toBe('idle');
    expect(sim.topCount).toBe(300);
    // Inclinado 30°: fluye.
    const g = { x: Math.sin(Math.PI / 6), y: Math.cos(Math.PI / 6) };
    for (let i = 0; i < 40; i++) sim.step(g);
    expect(syncSandToTarget(sim, 295, g)).toBe('flowing');
    expect(sim.topCount).toBeLessThan(300);
  });

  it('sin granos junto al cuello no fluye', () => {
    const sim = make();
    sim.arrange(0, 10);
    sim.clear();
    expect(syncSandToTarget(sim, 0)).toBe('idle');
  });
});

describe('volteo y avalanchas (1.3)', () => {
  it('rotateHalfTurn pasa la arena de abajo arriba sin perder granos', () => {
    const sim = make(61);
    sim.arrange(100, 500);
    sim.rotateHalfTurn();
    expect(sim.topCount).toBe(500);
    expect(sim.bottomCount).toBe(100);
    expect(sim.countGrains()).toEqual({ top: 500, bottom: 100 });
    // La máscara es simétrica: el giro no deja granos fuera del vidrio.
    const n = sim.mask.length;
    for (let i = 0; i < n; i++) expect(sim.mask[i]).toBe(sim.mask[n - 1 - i]);
  });

  it('al inclinar, la superficie se desliza poco a poco (no de golpe) y acaba quieta', () => {
    const sim = make(61);
    sim.arrange(0, 600);
    for (let i = 0; i < 300 && !sim.isSettled; i++) sim.step();
    const g = { x: Math.sin(0.6), y: Math.cos(0.6) }; // ~34°
    const firstMoves = sim.step(g);
    let total = firstMoves;
    let steps = 1;
    while (!sim.isSettled && steps < 3000) {
      total += sim.step(g);
      steps++;
    }
    // Avalancha: muchos pasos con movimiento, no todo en el primero.
    expect(steps).toBeGreaterThan(20);
    expect(firstMoves).toBeLessThan(total / 4);
    expect(sim.isSettled).toBe(true);
    expect(sim.countGrains().bottom).toBe(600);
  });

  it('sin rozamiento (staticFriction 1) se asienta antes que con rozamiento', () => {
    const settle = (staticFriction: number) => {
      const sim = new SandSimulation({ profile: CLASSIC_MODEL.profile, cols: 61, seed: 7, staticFriction });
      sim.arrange(0, 600);
      for (let i = 0; i < 300 && !sim.isSettled; i++) sim.step();
      const g = { x: Math.sin(0.6), y: Math.cos(0.6) };
      sim.step(g);
      let steps = 1;
      while (!sim.isSettled && steps < 3000) {
        sim.step(g);
        steps++;
      }
      return steps;
    };
    expect(settle(0.3)).toBeGreaterThan(settle(1));
  });
});
