/**
 * Vectores 2D mínimos para la "física" de la arena.
 *
 * Convención de ejes: la de la pantalla. X crece hacia la derecha e Y crece
 * hacia ABAJO. Por eso la gravedad "normal" (móvil en vertical) es (0, 1).
 */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Gravedad por defecto: hacia abajo de la pantalla. */
export const GRAVITY_DOWN: Vec2 = Object.freeze({ x: 0, y: 1 });

/** Sin inclinación (para la luz/paralaje). */
export const NO_TILT: Vec2 = Object.freeze({ x: 0, y: 0 });

export function vec(x: number, y: number): Vec2 {
  return { x, y };
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

/** Devuelve el vector unitario; si es (casi) nulo devuelve `fallback`. */
export function normalize(v: Vec2, fallback: Vec2 = GRAVITY_DOWN): Vec2 {
  const len = length(v);
  if (len < 1e-9 || !Number.isFinite(len)) return fallback;
  // Si ya es unitario, devolvemos el mismo objeto: el bucle de animación
  // llama a esto en cada fotograma y así no crea basura innecesaria.
  if (Math.abs(len - 1) < 1e-12) return v;
  return { x: v.x / len, y: v.y / len };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

/** Ángulo en radianes entre dos vectores (0..π). */
export function angleBetween(a: Vec2, b: Vec2): number {
  const na = normalize(a);
  const nb = normalize(b);
  return Math.acos(Math.min(1, Math.max(-1, dot(na, nb))));
}

/** Limita cada componente a [-max, max] (útil para inclinaciones). */
export function clampMagnitude(v: Vec2, max: number): Vec2 {
  const len = length(v);
  if (len <= max || len === 0) return v;
  return { x: (v.x / len) * max, y: (v.y / len) * max };
}
