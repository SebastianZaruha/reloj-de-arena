/**
 * 1.6: la arena de arriba se vacía como en un reloj real.
 *  - Sale primero la de junto al cuello y lo de encima baja a llenar el hueco
 *    en un embudo ancho (no un canal vertical desde la superficie).
 *  - En reposo la superficie es un embudo suave e irregular, no una recta.
 */
import { describe, expect, it } from 'vitest';
import { CLASSIC_MODEL, GRAVITY_DOWN, SAND, SandSimulation } from '../src';

const makeSim = () =>
  new SandSimulation({
    profile: CLASSIC_MODEL.profile,
    cols: 81,
    slideChance: SAND.slideChance,
    fillRatio: SAND.fillRatio,
    seed: 7,
  });

/** Fila de la superficie (primera celda con arena desde arriba) de cada columna del bulbo de arriba. */
function surface(sim: SandSimulation): number[] {
  const out: number[] = [];
  for (let col = 0; col < sim.cols; col++) {
    let top = -1;
    let inside = false;
    for (let row = 0; row < sim.gateRow; row++) {
      const i = row * sim.cols + col;
      if (sim.mask[i] !== 1) continue;
      inside = true;
      if (sim.cells[i] !== 0) {
        top = row;
        break;
      }
    }
    out.push(inside ? top : -1);
  }
  return out;
}

describe('embudo del bulbo de arriba (1.6)', () => {
  it('al vaciarse no abre un canal vertical: el hueco se reparte en embudo', () => {
    const sim = makeSim();
    const n = Math.round(sim.totalGrains * 0.7);
    sim.arrange(n, sim.totalGrains - n, GRAVITY_DOWN, { crater: 0.25 });
    const before = surface(sim);
    // Peor caso: 40 granos seguidos sin dejar que la arena se mueva entre medias.
    sim.transfer(40, GRAVITY_DOWN);
    const after = surface(sim);
    let deepest = 0;
    let changed = 0;
    for (let c = 0; c < sim.cols; c++) {
      if (before[c]! < 0 || after[c]! < 0) continue;
      const drop = after[c]! - before[c]!;
      if (drop > 0) changed++;
      deepest = Math.max(deepest, drop);
    }
    // Antes: 3 columnas bajaban 14 filas (el canal). Ahora el hueco se
    // reparte entre ~26 columnas alrededor del eje y baja ~3 filas.
    expect(deepest).toBeLessThan(7);
    expect(changed).toBeGreaterThan(12);
    expect(sim.topCount + sim.bottomCount).toBe(sim.totalGrains);
  });

  it('en reposo la superficie es un embudo suave, más bajo en el centro e irregular', () => {
    const sim = makeSim();
    const n = Math.round(sim.totalGrains * 0.6);
    sim.arrange(n, sim.totalGrains - n, GRAVITY_DOWN, { crater: 0.25 });
    const s = surface(sim);
    const cx = sim.centerCol;
    const center = s[cx]!;
    const sideL = s[cx - 18]!;
    const sideR = s[cx + 18]!;
    // Centro más bajo (fila mayor) que los lados.
    expect(center - sideL).toBeGreaterThan(2);
    expect(center - sideR).toBeGreaterThan(2);
    // No es una V perfecta: los lados no son simétricos fila a fila.
    let asym = 0;
    for (let d = 3; d <= 18; d++) if (s[cx - d] !== s[cx + d]) asym++;
    expect(asym).toBeGreaterThan(4);
  });
});
