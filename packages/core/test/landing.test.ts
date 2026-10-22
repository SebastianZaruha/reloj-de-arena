import { describe, expect, it } from 'vitest';
import { CLASSIC_MODEL, SandSimulation } from '../src';

describe('aterrizaje de granos (1.2)', () => {
  it('muchos granos por fotograma no levantan una torre de un grano de ancho', () => {
    const sim = new SandSimulation({ profile: CLASSIC_MODEL.profile, cols: 95, seed: 7 });
    sim.arrange(3000, sim.totalGrains - 3000);
    // Pocos fotogramas por segundo: 8 granos de golpe y un solo paso de física.
    for (let f = 0; f < 60; f++) {
      sim.transfer(8);
      sim.step();
    }
    const c = Math.round(sim.centerCol);
    // Bajo el cuello no puede haber una columna aislada (celda con arena y
    // ambos lados vacíos) de más de 2 celdas seguidas.
    let run = 0;
    let worst = 0;
    for (let r = sim.gateRow + 1; r < sim.rows; r++) {
      const i = r * sim.cols + c;
      const lonely = sim.cells[i] !== 0 && sim.cells[i - 1] === 0 && sim.cells[i + 1] === 0;
      run = lonely ? run + 1 : 0;
      worst = Math.max(worst, run);
    }
    expect(worst).toBeLessThanOrEqual(2);
    const n = sim.countGrains();
    expect(n.top + n.bottom).toBe(sim.totalGrains);
  });
});
