/**
 * Máquina de estados de la ORIENTACIÓN del reloj (lógica pura).
 *
 * Recibe el ángulo de giro del móvil en el plano de la pantalla ("roll":
 * 0° = de pie, ±90° = de lado, 180° = boca abajo) y decide tres eventos:
 *
 *  - 'tilt-pause':  el móvil se ha tumbado de lado (≈90°) → pausar.
 *  - 'tilt-resume': ha vuelto a ponerse de pie → reanudar.
 *  - 'flip':        se ha volteado del todo (≈180°) → el reloj se da la
 *                   vuelta y empieza de cero.
 *
 * Dos trucos para que no "parpadee" con el temblor de la mano:
 *  - HISTÉRESIS: para pausar hay que pasar de 70°, pero para reanudar hay
 *    que bajar de 55°. Entre medias se mantiene el estado que hubiera.
 *  - REBOTE (debounce): la condición debe mantenerse un rato seguido
 *    (p. ej. 300 ms para voltear). Si se interrumpe, se empieza a contar
 *    de nuevo. Así, girar rápido de 0° a 180° pasa por 90° sin pausar.
 *
 * Tras un 'flip' la referencia cambia: lo que ahora es "de pie" es la nueva
 * posición (base 180°). Así se puede voltear una y otra vez, como un reloj
 * de arena de verdad.
 *
 * Si el móvil está casi plano (sobre la mesa) el ángulo no es fiable: no se
 * cambia de estado (se mantiene el que hubiera).
 */

export type OrientationEvent = 'tilt-pause' | 'tilt-resume' | 'flip';

export interface OrientationOptions {
  /** Grados a partir de los que se considera "de lado" (pausa). */
  readonly pauseEnterDeg?: number;
  /** Grados por debajo de los que vuelve a estar "de pie" (reanudar). */
  readonly pauseExitDeg?: number;
  /** Grados a partir de los que se considera volteado. */
  readonly flipEnterDeg?: number;
  /** Mientras se espera el rebote del volteo, se tolera bajar hasta aquí. */
  readonly flipHoldDeg?: number;
  /** Tiempo que debe mantenerse cada condición (ms). */
  readonly pauseDebounceMs?: number;
  readonly resumeDebounceMs?: number;
  readonly flipDebounceMs?: number;
  /**
   * Fracción mínima de la gravedad en el plano de la pantalla (0..1) para
   * fiarse del ángulo. Por debajo (móvil casi plano) no hay cambios.
   */
  readonly minPlanar?: number;
}

export const ORIENTATION_DEFAULTS: Required<OrientationOptions> = Object.freeze({
  pauseEnterDeg: 70,
  pauseExitDeg: 55,
  flipEnterDeg: 150,
  flipHoldDeg: 140,
  pauseDebounceMs: 220,
  resumeDebounceMs: 160,
  flipDebounceMs: 300,
  minPlanar: 0.5,
});

/** Candidatos internos a cambio de estado. */
const NONE = 0;
const TO_SIDE = 1;
const TO_UPRIGHT = 2;
const TO_FLIP = 3;

/** Lleva un ángulo en grados al rango (-180, 180]. */
export function wrapDegrees(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

export class OrientationTracker {
  private readonly o: Required<OrientationOptions>;
  /** true si el reloj está dado la vuelta respecto a la pantalla (base 180°). */
  private flippedValue = false;
  private sidewaysValue = false;
  /** Lado hacia el que está tumbado: 1 = "abajo" queda a la derecha de la pantalla, -1 = a la izquierda. */
  private side: 1 | -1 = 1;
  private pending = NONE;
  private pendingSince = 0;
  /** Ángulo relativo a la base de la última muestra fiable (para depurar/tests). */
  private relative = 0;

  constructor(options: OrientationOptions = {}) {
    this.o = { ...ORIENTATION_DEFAULTS, ...options };
  }

  get flipped(): boolean {
    return this.flippedValue;
  }

  get sideways(): boolean {
    return this.sidewaysValue;
  }

  /** Lado hacia el que está tumbado (solo tiene sentido si `sideways`). */
  get sideSign(): 1 | -1 {
    return this.side;
  }

  /** Ángulo (grados) respecto a la posición "de pie" actual. */
  get relativeDegrees(): number {
    return this.relative;
  }

  /** Vuelve al estado inicial (de pie, sin voltear). */
  reset(): void {
    this.flippedValue = false;
    this.sidewaysValue = false;
    this.side = 1;
    this.pending = NONE;
    this.relative = 0;
  }

  /**
   * Procesa una muestra.
   * @param rollDeg giro en el plano de la pantalla (0 = de pie)
   * @param planar fracción de la gravedad en el plano de la pantalla (0..1)
   * @param nowMs marca de tiempo (ms)
   * @returns el evento que acaba de ocurrir, o null
   */
  update(rollDeg: number, planar: number, nowMs: number): OrientationEvent | null {
    const o = this.o;
    if (!Number.isFinite(rollDeg) || !Number.isFinite(nowMs) || !(planar >= o.minPlanar)) {
      // Móvil plano o dato raro: no decidimos nada y olvidamos lo pendiente.
      this.pending = NONE;
      return null;
    }
    const rel = wrapDegrees(rollDeg - (this.flippedValue ? 180 : 0));
    this.relative = rel;
    const a = Math.abs(rel);

    let candidate = NONE;
    if (a >= o.flipEnterDeg || (this.pending === TO_FLIP && a >= o.flipHoldDeg)) candidate = TO_FLIP;
    else if (!this.sidewaysValue && a >= o.pauseEnterDeg) candidate = TO_SIDE;
    else if (this.sidewaysValue && a <= o.pauseExitDeg) candidate = TO_UPRIGHT;

    if (candidate !== this.pending) {
      this.pending = candidate;
      this.pendingSince = nowMs;
    }
    if (candidate === NONE) return null;

    const wait =
      candidate === TO_FLIP
        ? o.flipDebounceMs
        : candidate === TO_SIDE
          ? o.pauseDebounceMs
          : o.resumeDebounceMs;
    if (nowMs - this.pendingSince < wait) return null;

    this.pending = NONE;
    switch (candidate) {
      case TO_FLIP:
        this.flippedValue = !this.flippedValue;
        this.sidewaysValue = false;
        this.relative = wrapDegrees(rel - 180);
        return 'flip';
      case TO_SIDE:
        this.sidewaysValue = true;
        this.side = rel >= 0 ? 1 : -1;
        return 'tilt-pause';
      default:
        this.sidewaysValue = false;
        return 'tilt-resume';
    }
  }
}
