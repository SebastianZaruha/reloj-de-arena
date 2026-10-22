import { describe, expect, it } from 'vitest';
import { OrientationTracker, wrapDegrees, type OrientationEvent } from '../src';

/** Alimenta el tracker con un ángulo constante durante `ms` (muestras cada 20 ms). */
function hold(t: OrientationTracker, deg: number, fromMs: number, ms: number, planar = 1) {
  const events: OrientationEvent[] = [];
  for (let now = fromMs; now <= fromMs + ms; now += 20) {
    const e = t.update(deg, planar, now);
    if (e) events.push(e);
  }
  return events;
}

describe('wrapDegrees', () => {
  it('lleva cualquier ángulo a (-180, 180]', () => {
    expect(wrapDegrees(0)).toBe(0);
    expect(wrapDegrees(190)).toBe(-170);
    expect(wrapDegrees(-190)).toBe(170);
    expect(wrapDegrees(180)).toBe(180);
    expect(wrapDegrees(-180)).toBe(180);
    expect(wrapDegrees(720 + 30)).toBe(30);
  });
});

describe('OrientationTracker', () => {
  it('las inclinaciones normales no hacen nada', () => {
    const t = new OrientationTracker();
    expect(hold(t, 30, 0, 2000)).toEqual([]);
    expect(hold(t, -65, 2000, 2000)).toEqual([]);
    expect(t.sideways).toBe(false);
  });

  it('de lado (>70°) pausa tras el rebote y de pie (<55°) reanuda', () => {
    const t = new OrientationTracker();
    // Un instante a 85° (menos que el rebote) no pausa.
    expect(hold(t, 85, 0, 100)).toEqual([]);
    expect(hold(t, 20, 120, 100)).toEqual([]);
    // Mantenido, sí.
    expect(hold(t, 85, 300, 400)).toEqual(['tilt-pause']);
    expect(t.sideways).toBe(true);
    expect(t.sideSign).toBe(1);
    // Histéresis: a 60° sigue en pausa.
    expect(hold(t, 60, 800, 1000)).toEqual([]);
    expect(hold(t, 40, 1900, 400)).toEqual(['tilt-resume']);
    expect(t.sideways).toBe(false);
  });

  it('recuerda hacia qué lado se tumbó', () => {
    const t = new OrientationTracker();
    expect(hold(t, -95, 0, 400)).toEqual(['tilt-pause']);
    expect(t.sideSign).toBe(-1);
  });

  it('voltear rápido (0 → 180°) no pausa: voltea', () => {
    const t = new OrientationTracker();
    const events = [...hold(t, 100, 0, 100), ...hold(t, 175, 120, 500)];
    expect(events).toEqual(['flip']);
    expect(t.flipped).toBe(true);
    // Ahora "de pie" es 180°: quedarse ahí no hace nada…
    expect(hold(t, 178, 700, 1000)).toEqual([]);
    // …y volver a 0° es voltear otra vez.
    expect(hold(t, 2, 1800, 500)).toEqual(['flip']);
    expect(t.flipped).toBe(false);
  });

  it('el rebote del volteo tolera el temblor (histéresis 150°/140°)', () => {
    const t = new OrientationTracker();
    const events: OrientationEvent[] = [];
    let now = 0;
    for (const deg of [152, 145, 151, 143, 155, 147, 150, 146, 152, 149, 151, 148, 153, 147, 156, 150]) {
      const e = t.update(deg, 1, now);
      if (e) events.push(e);
      now += 25;
    }
    expect(events).toEqual(['flip']);
  });

  it('volteado y luego de lado también pausa (respecto a la nueva base)', () => {
    const t = new OrientationTracker();
    hold(t, 180, 0, 400);
    expect(t.flipped).toBe(true);
    // 180° + 90° = -90° absoluto → relativo +90°.
    expect(hold(t, -90, 500, 400)).toEqual(['tilt-pause']);
    expect(t.sideSign).toBe(1);
  });

  it('con el móvil plano (poca gravedad en la pantalla) no cambia nada', () => {
    const t = new OrientationTracker();
    expect(hold(t, 120, 0, 2000, 0.2)).toEqual([]);
    expect(hold(t, 179, 2000, 2000, 0.3)).toEqual([]);
    expect(t.flipped).toBe(false);
    // Datos inválidos tampoco.
    expect(t.update(Number.NaN, 1, 5000)).toBeNull();
    t.reset();
    expect(t.relativeDegrees).toBe(0);
  });
});
