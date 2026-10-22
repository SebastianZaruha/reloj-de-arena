/**
 * De los datos del ACELERÓMETRO a lo que necesita el reloj (lógica pura).
 *
 * El acelerómetro mide, unas 30–60 veces por segundo, hacia dónde está el
 * suelo respecto al móvil. Esa señal tiembla (pulso, pasos, vibración), así
 * que la suavizamos con un filtro "paso bajo" y de ahí sacamos:
 *
 *  - `gravity`:    gravedad 2D en la pantalla, suave (chorro, dibujo).
 *  - `simGravity`: la misma, pero en escalones de 3° (simulación). Cada
 *                  cambio de dirección obliga a la simulación a reordenar sus
 *                  celdas; con escalones solo ocurre cuando de verdad se
 *                  inclina, no por el temblor de la mano.
 *  - `tilt`:       inclinación (-1..1) para mover la luz, los reflejos y la
 *                  sombra.
 *  - eventos de orientación (pausa de lado, reanudar, voltear), con
 *    `OrientationTracker`.
 *
 * CONVENCIÓN de entrada: vector "hacia el suelo" en ejes de PANTALLA:
 * x → derecha, y → abajo, z → hacia la persona que mira. Móvil de pie:
 * (0, 1, 0). Tumbado boca arriba en la mesa: (0, 0, -1). La app traduce el
 * sensor de cada plataforma a esta convención (useDeviceTilt.ts).
 *
 * "Marco del reloj": tras voltear el móvil, la app gira el dibujo 180°. Las
 * salidas se dan en ese marco (girando 180° si `flipped`), así para la
 * simulación "abajo" vuelve a ser abajo.
 *
 * Memoria: todo se guarda en campos numéricos y objetos creados una vez;
 * `push` no crea objetos (se llama decenas de veces por segundo).
 */
import { OrientationTracker, type OrientationEvent, type OrientationOptions } from './orientation';

/** Vector 2D modificable (se reutiliza en sitio, sin crear objetos). */
export interface MutableVec2 {
  x: number;
  y: number;
}

export interface MotionOptions {
  /** Constante de tiempo del filtro de la gravedad (ms). Más = más suave y lento. */
  readonly smoothingMs?: number;
  /** Escalón de la gravedad de la simulación (grados). */
  readonly simStepDeg?: number;
  /** Modo calmado (accesibilidad: reducir movimiento). */
  readonly calm?: boolean;
  readonly orientation?: OrientationOptions;
}

const DEG = 180 / Math.PI;
/** Constante de tiempo de la "posición de reposo" de la inclinación hacia delante/atrás. */
const PITCH_BASELINE_MS = 2500;
/** Por encima de este salto entre muestras (ms) se reinicia el filtro. */
const MAX_GAP_MS = 1000;
/** Cambio mínimo en las salidas para avisar de que hay que redibujar. */
const EPSILON = 0.002;

/** Factor de mezcla de un filtro paso bajo exponencial para un intervalo `dtMs`. */
export function lowPassFactor(dtMs: number, timeConstantMs: number): number {
  if (!(dtMs > 0)) return 0;
  if (!(timeConstantMs > 0)) return 1;
  return 1 - Math.exp(-dtMs / timeConstantMs);
}

/** smoothstep clásico (0..1). */
function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp1(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/**
 * Gravedad de la pantalla a partir de la gravedad 3D (ya filtrada).
 *
 * Si el móvil está casi plano, su proyección en la pantalla es diminuta y su
 * dirección, puro ruido. Entonces mezclamos hacia "abajo" (0, 1): es como
 * si el reloj siguiera de pie sobre su mesa al otro lado de la "ventana".
 * Escribe en `out` (sin crear objetos).
 */
export function screenGravity(gx: number, gy: number, out: MutableVec2): MutableVec2 {
  const planar = Math.hypot(gx, gy);
  const w = planar > 1e-6 ? smooth(0.15, 0.45, planar) : 0;
  const x = planar > 1e-6 ? (gx / planar) * w : 0;
  const y = planar > 1e-6 ? (gy / planar) * w + (1 - w) : 1;
  const len = Math.hypot(x, y);
  if (len < 1e-6) {
    // Ocurre solo boca abajo justo en la transición: elegimos "abajo".
    out.x = 0;
    out.y = 1;
  } else {
    out.x = x / len;
    out.y = y / len;
  }
  return out;
}

/**
 * Cuantiza la dirección de `g` en escalones de `stepDeg` con histéresis: solo
 * cambia cuando la dirección se aleja más de 0,6 escalones del valor actual.
 * Escribe en `out` y devuelve true si ha cambiado.
 */
export function quantizeDirection(g: MutableVec2, stepDeg: number, out: MutableVec2): boolean {
  const step = stepDeg / DEG;
  const angle = Math.atan2(g.y, g.x);
  const current = Math.atan2(out.y, out.x);
  let diff = angle - current;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  if (Math.abs(diff) < step * 0.6) return false;
  const q = Math.round(angle / step) * step;
  const nx = Math.cos(q);
  const ny = Math.sin(q);
  // Limpiamos los restos de coma flotante (cos(90°) ≈ 6e-17 → 0).
  out.x = Math.abs(nx) < 1e-9 ? 0 : nx;
  out.y = Math.abs(ny) < 1e-9 ? 0 : ny;
  return true;
}

export class MotionProcessor {
  /** Gravedad suave en el marco del reloj (unitaria). */
  readonly gravity: MutableVec2 = { x: 0, y: 1 };
  /** Gravedad en escalones para la simulación (unitaria). */
  readonly simGravity: MutableVec2 = { x: 0, y: 1 };
  /** Inclinación para la luz (-1..1 por eje). */
  readonly tilt: MutableVec2 = { x: 0, y: 0 };
  /** true si la última muestra cambió alguna salida (hay que redibujar). */
  changed = false;

  private readonly tracker: OrientationTracker;
  private readonly stepDeg: number;
  private smoothingMs: number;
  private calm: boolean;
  // Gravedad 3D filtrada (ejes de pantalla).
  private fx = 0;
  private fy = 1;
  private fz = 0;
  /** Componente z "de reposo" (cómo sueles sujetar el móvil). */
  private zBase = 0;
  private lastTime = Number.NaN;
  private readonly screen: MutableVec2 = { x: 0, y: 1 };

  constructor(options: MotionOptions = {}) {
    this.tracker = new OrientationTracker(options.orientation);
    this.stepDeg = options.simStepDeg ?? 3;
    this.calm = options.calm ?? false;
    this.smoothingMs = options.smoothingMs ?? 90;
  }

  /** ¿Está el reloj dado la vuelta (dibujo girado 180°)? */
  get flipped(): boolean {
    return this.tracker.flipped;
  }

  /** ¿Está el móvil tumbado de lado (≈90°)? */
  get sideways(): boolean {
    return this.tracker.sideways;
  }

  /** Lado hacia el que está tumbado: 1 = derecha, -1 = izquierda (marco del reloj). */
  get sideSign(): 1 | -1 {
    return this.tracker.sideSign;
  }

  /** Modo calmado: filtro más lento y luz que se mueve menos. */
  setCalm(calm: boolean): void {
    this.calm = calm;
  }

  /** Vuelve al estado inicial (de pie, sin inclinación). */
  reset(): void {
    this.tracker.reset();
    this.fx = 0;
    this.fy = 1;
    this.fz = 0;
    this.zBase = 0;
    this.lastTime = Number.NaN;
    this.gravity.x = 0;
    this.gravity.y = 1;
    this.simGravity.x = 0;
    this.simGravity.y = 1;
    this.tilt.x = 0;
    this.tilt.y = 0;
    this.changed = true;
  }

  /**
   * Procesa una muestra del acelerómetro (convención: ver arriba).
   * @returns el evento de orientación que acaba de ocurrir, o null.
   */
  push(x: number, y: number, z: number, nowMs: number): OrientationEvent | null {
    this.changed = false;
    const len = Math.hypot(x, y, z);
    if (!Number.isFinite(len) || len < 0.2 || !Number.isFinite(nowMs)) return null;
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;

    // 1) Filtro paso bajo (independiente de la frecuencia del sensor).
    const dt = this.lastTime;
    this.lastTime = nowMs;
    const gap = Number.isNaN(dt) ? Infinity : nowMs - dt;
    if (gap > MAX_GAP_MS || gap < 0) {
      // Primera muestra (o volvemos tras una pausa larga): sin arrastrar historia.
      this.fx = nx;
      this.fy = ny;
      this.fz = nz;
      this.zBase = nz;
    } else {
      const k = lowPassFactor(gap, this.calm ? this.smoothingMs * 2.5 : this.smoothingMs);
      this.fx += (nx - this.fx) * k;
      this.fy += (ny - this.fy) * k;
      this.fz += (nz - this.fz) * k;
      this.zBase += (this.fz - this.zBase) * lowPassFactor(gap, PITCH_BASELINE_MS);
    }

    // 2) Orientación (pausa/voltear) con el ángulo en el plano de la pantalla.
    const planar = Math.hypot(this.fx, this.fy);
    const roll = Math.atan2(this.fx, this.fy) * DEG;
    const event = this.tracker.update(roll, planar, nowMs);

    // 3) Salidas en el marco del reloj (girado 180° si está volteado).
    const s = this.tracker.flipped ? -1 : 1;
    const prevGx = this.gravity.x;
    const prevGy = this.gravity.y;
    const prevTx = this.tilt.x;
    const prevTy = this.tilt.y;
    screenGravity(this.fx * s, this.fy * s, this.screen);
    this.gravity.x = this.screen.x;
    this.gravity.y = this.screen.y;
    const simChanged = quantizeDirection(this.gravity, this.stepDeg, this.simGravity);
    const amount = this.calm ? 0.4 : 1;
    this.tilt.x = clamp1(this.fx * s * 1.1) * amount;
    this.tilt.y = clamp1((this.fz - this.zBase) * 2.5 * s) * amount;

    this.changed =
      simChanged ||
      event !== null ||
      Math.abs(this.gravity.x - prevGx) > EPSILON ||
      Math.abs(this.gravity.y - prevGy) > EPSILON ||
      Math.abs(this.tilt.x - prevTx) > EPSILON ||
      Math.abs(this.tilt.y - prevTy) > EPSILON;
    return event;
  }
}
