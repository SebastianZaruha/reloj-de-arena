/**
 * Abstracción del reloj del sistema.
 *
 * El motor nunca llama a `Date.now()` directamente: recibe la hora como
 * parámetro. Así en los tests podemos usar un reloj falso y "viajar en el
 * tiempo" sin esperar de verdad.
 */
export interface Clock {
  /** Milisegundos desde una época fija (como `Date.now()`). */
  now(): number;
}

/** Reloj real basado en `Date.now()`. */
export const systemClock: Clock = {
  now: () => Date.now(),
};

/** Reloj manual para tests: avanza solo cuando se lo pides. */
export class ManualClock implements Clock {
  constructor(private current = 0) {}

  now(): number {
    return this.current;
  }

  /** Avanza el reloj `ms` milisegundos. */
  advance(ms: number): void {
    this.current += ms;
  }

  /** Fija el reloj en un instante concreto. */
  set(ms: number): void {
    this.current = ms;
  }
}
