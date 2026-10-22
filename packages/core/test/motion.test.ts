import { describe, expect, it } from 'vitest';
import {
  flip,
  lowPassFactor,
  MotionProcessor,
  quantizeDirection,
  screenGravity,
  snapshot,
  start,
  createTimer,
  pause,
  type MutableVec2,
} from '../src';

const rad = (deg: number) => (deg * Math.PI) / 180;
/** Muestra "hacia el suelo" de un móvil girado `deg` en el plano de la pantalla. */
const rolled = (deg: number): [number, number, number] => [Math.sin(rad(deg)), Math.cos(rad(deg)), 0];

function feed(m: MotionProcessor, sample: [number, number, number], fromMs: number, ms: number, every = 33) {
  const events: string[] = [];
  for (let now = fromMs; now <= fromMs + ms; now += every) {
    const e = m.push(sample[0], sample[1], sample[2], now);
    if (e) events.push(e);
  }
  return events;
}

describe('filtro y mapeo de la gravedad', () => {
  it('lowPassFactor no depende de la frecuencia (dos pasos de 10 = uno de 20)', () => {
    const a = lowPassFactor(10, 90);
    const twice = 1 - (1 - a) * (1 - a);
    expect(twice).toBeCloseTo(lowPassFactor(20, 90), 10);
    expect(lowPassFactor(0, 90)).toBe(0);
    expect(lowPassFactor(10, 0)).toBe(1);
  });

  it('screenGravity normaliza y, con el móvil plano, vuelve a "abajo"', () => {
    const out: MutableVec2 = { x: 0, y: 0 };
    screenGravity(0.5, 0.5, out);
    expect(out.x).toBeCloseTo(Math.SQRT1_2);
    expect(out.y).toBeCloseTo(Math.SQRT1_2);
    screenGravity(0.05, 0.01, out); // casi plano
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(1);
    screenGravity(0, 0, out);
    expect(out).toEqual({ x: 0, y: 1 });
  });

  it('quantizeDirection: escalones con histéresis', () => {
    const out: MutableVec2 = { x: 0, y: 1 };
    expect(quantizeDirection({ x: Math.sin(rad(1)), y: Math.cos(rad(1)) }, 3, out)).toBe(false);
    expect(quantizeDirection({ x: Math.sin(rad(-10)), y: Math.cos(rad(-10)) }, 3, out)).toBe(true);
    // atan2(y, x): -10° respecto a la vertical = 100° respecto al eje x → escalón de 99°.
    expect((Math.atan2(out.y, out.x) * 180) / Math.PI).toBeCloseTo(99, 5);
    // Al cruzar ±180° también funciona (gravedad hacia la izquierda).
    const left: MutableVec2 = { x: -1, y: 0 };
    expect(quantizeDirection({ x: -1, y: -0.01 }, 3, left)).toBe(false);
  });
});

describe('MotionProcessor', () => {
  it('suaviza: un cambio brusco tarda unas muestras en notarse del todo', () => {
    const m = new MotionProcessor();
    feed(m, rolled(0), 0, 300);
    m.push(...rolled(40), 333);
    const after1 = Math.asin(m.gravity.x) * (180 / Math.PI);
    expect(after1).toBeGreaterThan(2);
    expect(after1).toBeLessThan(25);
    feed(m, rolled(40), 366, 1000);
    expect(Math.asin(m.gravity.x) * (180 / Math.PI)).toBeCloseTo(40, 0);
    // La gravedad de la simulación va en escalones de 3°.
    const simDeg = (Math.atan2(m.simGravity.y, m.simGravity.x) * 180) / Math.PI;
    expect(Math.abs(simDeg / 3 - Math.round(simDeg / 3))).toBeLessThan(1e-9);
    expect(m.tilt.x).toBeGreaterThan(0.5);
  });

  it('no avisa de cambios si la señal no cambia (no despierta el dibujo)', () => {
    const m = new MotionProcessor();
    feed(m, rolled(10), 0, 2000);
    m.push(...rolled(10), 2033);
    expect(m.changed).toBe(false);
  });

  it('pausa de lado, reanuda de pie y voltea (y gira el marco 180°)', () => {
    const m = new MotionProcessor();
    feed(m, rolled(0), 0, 300);
    expect(feed(m, rolled(90), 333, 900)).toEqual(['tilt-pause']);
    expect(m.sideways).toBe(true);
    expect(m.gravity.x).toBeGreaterThan(0.9); // la arena cae hacia la derecha
    expect(feed(m, rolled(0), 1300, 900)).toEqual(['tilt-resume']);
    expect(feed(m, rolled(180), 2300, 1200)).toContain('flip');
    expect(m.flipped).toBe(true);
    // Boca abajo, pero en el marco del reloj (girado) la gravedad vuelve a ser "abajo".
    expect(m.gravity.y).toBeGreaterThan(0.99);
    expect(m.simGravity.y).toBeCloseTo(1, 5);
  });

  it('modo calmado: la luz se mueve menos', () => {
    const normal = new MotionProcessor();
    const calm = new MotionProcessor({ calm: true });
    feed(normal, rolled(30), 0, 2000);
    feed(calm, rolled(30), 0, 2000);
    expect(Math.abs(calm.tilt.x)).toBeLessThan(Math.abs(normal.tilt.x) * 0.5);
    calm.setCalm(false);
    calm.reset();
    expect(calm.gravity).toEqual({ x: 0, y: 1 });
    expect(calm.flipped).toBe(false);
  });

  it('ignora muestras inválidas', () => {
    const m = new MotionProcessor();
    expect(m.push(Number.NaN, 1, 0, 0)).toBeNull();
    expect(m.push(0, 0, 0, 0)).toBeNull();
    expect(m.gravity).toEqual({ x: 0, y: 1 });
  });
});

describe('flip (voltear el temporizador)', () => {
  it('empieza de cero con la misma duración, ya corriendo', () => {
    let s = start(createTimer(60_000), 0);
    s = pause(s, 20_000);
    const f = flip(s, 30_000);
    expect(f.status).toBe('running');
    expect(f.durationMs).toBe(60_000);
    expect(snapshot(f, 30_000).remainingMs).toBe(60_000);
    expect(snapshot(f, 40_000).remainingMs).toBe(50_000);
  });
});
