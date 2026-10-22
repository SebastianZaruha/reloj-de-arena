import { describe, expect, it } from 'vitest';
import {
  angleBetween,
  clampMagnitude,
  CLASSIC_MODEL,
  dot,
  GRAVITY_DOWN,
  innerRadiusAt,
  isInside,
  length,
  normalize,
  outlinePoints,
  profileNorm,
  radiusAt,
  smoothMax,
  vec,
} from '../src';

const P = CLASSIC_MODEL.profile;

describe('perfil del reloj', () => {
  it('smoothMax se parece a max lejos de la transición y redondea cerca', () => {
    expect(smoothMax(1, 0, 0.1)).toBeCloseTo(1);
    expect(smoothMax(0, 1, 0.1)).toBeCloseTo(1);
    expect(smoothMax(0.5, 0.5, 0.2)).toBeGreaterThan(0.5);
  });

  it('el cuello es estrecho y el bulbo alcanza el ancho máximo (1)', () => {
    expect(radiusAt(P, 0)).toBeLessThan(0.15);
    let max = 0;
    for (let i = 0; i <= 1000; i++) max = Math.max(max, radiusAt(P, i / 1000));
    expect(max).toBeCloseTo(1, 3);
    // Forma de pera: más ancho por encima del centro de la elipse (hacia el extremo).
    expect(radiusAt(P, P.bulbCenter + 0.1)).toBeGreaterThan(radiusAt(P, P.bulbCenter - 0.1));
    expect(radiusAt(P, -P.bulbCenter)).toBeCloseTo(radiusAt(P, P.bulbCenter));
    expect(radiusAt(P, 1.2)).toBe(0);
    expect(innerRadiusAt(P, 0.5)).toBeLessThan(radiusAt(P, 0.5));
  });

  it('profileNorm vale 1 sin asimetría', () => {
    expect(profileNorm({ ...P, egg: 0 })).toBe(1);
    expect(profileNorm(P)).toBeGreaterThan(1);
    expect(radiusAt({ ...P, egg: 0, taper: 1 }, P.bulbCenter)).toBeCloseTo(1);
  });

  it('isInside distingue interior y exterior', () => {
    expect(isInside(P, 0, 0.5)).toBe(true);
    expect(isInside(P, 0.95, 0.02)).toBe(false);
    expect(isInside(P, 0, 0.9999)).toBe(false);
  });

  it('genera puntos de contorno exterior e interior', () => {
    const outer = outlinePoints(P, 10);
    const inner = outlinePoints(P, 10, true);
    expect(outer).toHaveLength(11);
    expect(outer[0]?.y).toBe(-1);
    expect(inner[0]?.y).toBeGreaterThan(-1);
  });
});

describe('vectores', () => {
  it('operaciones básicas', () => {
    expect(length(vec(3, 4))).toBe(5);
    expect(normalize(vec(0, 2))).toEqual({ x: 0, y: 1 });
    expect(normalize(vec(0, 0))).toBe(GRAVITY_DOWN);
    expect(normalize(vec(Number.NaN, 1))).toBe(GRAVITY_DOWN);
    expect(dot(vec(1, 2), vec(3, 4))).toBe(11);
    expect(angleBetween(vec(1, 0), vec(0, 1))).toBeCloseTo(Math.PI / 2);
    expect(clampMagnitude(vec(3, 4), 1)).toEqual({ x: 0.6, y: 0.8 });
    expect(clampMagnitude(vec(0.1, 0), 1)).toEqual({ x: 0.1, y: 0 });
  });
});
