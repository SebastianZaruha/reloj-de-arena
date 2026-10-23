/**
 * Entradas físicas del renderizador.
 *
 * El renderizador NO lee sensores: recibe una "fuente de movimiento"
 * (`MotionSource`) que otro módulo actualiza EN SITIO (sin re-renderizar
 * React) y que avisa cuando cambia. En la app la alimenta el acelerómetro
 * (src/motion/); en la versión de escritorio podría ser el ratón.
 */
import type { TimerSnapshot, Vec2 } from '@reloj/core';

/** Lo que necesita el pintor en cada fotograma. */
export interface PhysicalInputs {
  /** Gravedad en coordenadas de pantalla (unitaria). Por defecto (0, 1). */
  readonly gravity: Vec2;
  /**
   * Inclinación del móvil (-1..1 en cada eje). Mueve la luz de los reflejos,
   * la sombra y crea paralaje entre capas. Por defecto (0, 0).
   */
  readonly tilt: Vec2;
}

/** Fuente de movimiento en vivo (se lee en cada fotograma). */
export interface MotionSource extends PhysicalInputs {
  /** Gravedad en escalones (para la simulación de granos). */
  readonly simGravity: Vec2;
  /** ¿Está el reloj volteado? (el dibujo se gira 180°) */
  readonly flipped: boolean;
  /** Número de volteos desde el inicio: si cambia, la arena da la vuelta. */
  readonly flips: number;
  /** Avisa cuando cambia algo. Devuelve la función para darse de baja. */
  subscribe(listener: () => void): () => void;
}

const DOWN: Vec2 = Object.freeze({ x: 0, y: 1 });
const ZERO: Vec2 = Object.freeze({ x: 0, y: 0 });

/** Fuente "quieta": móvil de pie, sin inclinación (web sin simulación, tests). */
export const STILL_MOTION: MotionSource = Object.freeze({
  gravity: DOWN,
  simGravity: DOWN,
  tilt: ZERO,
  flipped: false,
  flips: 0,
  subscribe: () => () => undefined,
});

/**
 * Foto del temporizador que lee el reloj en cada fotograma. Además del
 * tiempo, puede traer `transitions`: el número de cambios de fase (ciclos
 * trabajo/descanso, 1.5). Cuando sube, el reloj se da la vuelta con una
 * animación y la arena vuelve a empezar (ver useSandEngine).
 */
export type HourglassSnapshot = TimerSnapshot & { readonly transitions?: number };
