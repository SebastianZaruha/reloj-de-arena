/**
 * Generador de números pseudoaleatorios con semilla (mulberry32).
 *
 * Usamos uno propio en vez de `Math.random()` para que la simulación sea
 * reproducible: con la misma semilla, los tests obtienen siempre el mismo
 * resultado.
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash entero rápido (para asignar tonos estables a cada grano). */
export function hash32(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return x >>> 0;
}
