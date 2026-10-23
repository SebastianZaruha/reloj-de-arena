/**
 * Partículas decorativas del chorro de arena.
 *
 * La simulación de celdas (SandSimulation) decide CUÁNTA arena pasa y dónde
 * se acumula. Pero un chorro real no es una línea: son granos sueltos que
 * caen acelerando, con huecos irregulares, alguno que se separa, más densos
 * junto al cuello (van despacio) y más dispersos abajo (van deprisa), y que
 * al chocar con el montón saltan un poco y ruedan por la ladera.
 *
 * Este módulo simula SOLO esos granos visuales:
 *
 *   - 'fall'  → granos del chorro (gravedad + algo de rozamiento distinto
 *               en cada uno, así no caen todos a la misma velocidad).
 *   - 'swirl' → granos sueltos que giran en la boca del embudo justo antes
 *               de entrar en el cuello (la "nubecita" del cuello).
 *   - 'hop'   → salpicaduras: al impactar, algún grano rebota.
 *   - 'roll'  → el grano rebotado rueda celda a celda ladera abajo.
 *
 * Diseño para memoria baja: capacidad FIJA y arrays tipados preasignados.
 * En el bucle no se crea ningún objeto: las partículas muertas se eliminan
 * moviendo la última a su hueco ("swap-remove"). Aleatoriedad con semilla
 * (createRng) para que los tests sean reproducibles.
 *
 * Unidades: CELDAS de la rejilla de la simulación (x a la derecha, y hacia
 * abajo). El pintor las convierte a píxeles.
 */
import { GRAVITY_DOWN, normalize, type Vec2 } from '../physics/vector';
import { createRng, type Rng } from './random';
import type { SandSimulation } from './sandSimulation';

export const PARTICLE_FALL = 1;
export const PARTICLE_SWIRL = 2;
export const PARTICLE_HOP = 3;
export const PARTICLE_ROLL = 4;

/** Entradas de un fotograma (objeto reutilizable: se rellena en sitio). */
export interface StreamInput {
  /** Segundos desde el fotograma anterior (se limita internamente). */
  dt: number;
  /** ¿Está pasando arena por el cuello ahora mismo? */
  emitting: boolean;
  /** Grosor relativo del chorro (0..1): más fino en temporizadores largos. */
  intensity: number;
  /** Gravedad (no hace falta que sea unitaria). */
  gravity: Vec2;
  /** Versión calmada (accesibilidad: reducir movimiento). */
  calm: boolean;
  /**
   * Caudal REAL de arena que pide el temporizador, en granos por segundo
   * (granos de la tanda / duración). Opcional: sin él, el chorro se dibuja
   * como siempre. Con mucho caudal (p. ej. un bulbo lleno que debe vaciarse
   * en un minuto) el chorro se vuelve continuo: ver `streamContinuity`.
   */
  flowRate?: number;
}

export interface StreamOptions {
  readonly capacity?: number;
  readonly seed?: number;
}

/** Aceleración de la gravedad en celdas/s². */
const GRAVITY = 520;
/** Granos por segundo con el chorro a pleno rendimiento. */
const BASE_RATE = 110;
/** Por debajo de estos granos en el bulbo emisor, el chorro adelgaza. */
const THIN_BELOW = 70;
/** Caudal (granos/s) hasta el que el chorro mantiene sus huecos irregulares. */
const SPARSE_FLOW = 20;
/** Caudal (granos/s) a partir del cual el chorro es un hilo continuo. */
const DENSE_FLOW = 180;
/** Paso máximo de tiempo (si la app se congela, no "teletransportamos"). */
const MAX_DT = 1 / 20;

export class StreamParticles {
  readonly capacity: number;
  /** Posición y velocidad (celdas, celdas/s). */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  /** Vida restante (s). */
  readonly life: Float32Array;
  /** Factor de aceleración (0.8..1): granos más "lentos" o más rápidos. */
  readonly accel: Float32Array;
  /** Radio relativo a la celda (para dibujar). */
  readonly size: Float32Array;
  /** Tipo (PARTICLE_*) y tono de color (1..255, como las celdas). */
  readonly kind: Uint8Array;
  readonly tone: Uint8Array;
  /** Partículas vivas: ocupan los índices 0..count-1. */
  count = 0;
  /** Granos del chorro emitidos desde el último `reset` (para tests y medidas). */
  emitted = 0;

  private rng: Rng;
  private time = 0;
  private emitDebt = 0;
  private swirlDebt = 0;
  /** Fases aleatorias del "ruido" que hace temblar el chorro. */
  private phase = new Float32Array(4);

  constructor(options: StreamOptions = {}) {
    const cap = Math.max(16, Math.floor(options.capacity ?? 360));
    this.capacity = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.accel = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.kind = new Uint8Array(cap);
    this.tone = new Uint8Array(cap);
    this.rng = createRng(options.seed ?? 12345);
    this.reset(options.seed ?? 12345);
  }

  /** Borra todas las partículas y reinicia la aleatoriedad. */
  reset(seed = 12345): void {
    this.rng = createRng(seed);
    this.count = 0;
    this.emitted = 0;
    this.time = 0;
    this.emitDebt = 0;
    this.swirlDebt = 0;
    for (let i = 0; i < this.phase.length; i++) this.phase[i] = this.rng() * Math.PI * 2;
  }

  get active(): boolean {
    return this.count > 0;
  }

  /**
   * Avanza un fotograma: emite granos nuevos (si fluye arena), mueve los
   * existentes y elimina los que chocan o caducan.
   */
  update(sim: SandSimulation, input: StreamInput): void {
    const dt = Number.isFinite(input.dt) ? Math.min(MAX_DT, Math.max(0, input.dt)) : 0;
    if (dt === 0) return;
    this.time += dt;
    const g = normalize(input.gravity, GRAVITY_DOWN);
    // Sin gravedad "vertical" suficiente no hay chorro (reloj tumbado).
    const dir = g.y >= 0 ? 1 : -1;
    const vertical = Math.abs(g.y) >= 0.25;

    if (input.emitting && vertical) this.emit(sim, g, dir, dt, input);
    this.integrate(sim, g, dir, dt, input.calm);
  }

  // ───────────────────────── emisión ─────────────────────────

  private emit(sim: SandSimulation, g: Vec2, dir: number, dt: number, input: StreamInput): void {
    const rng = this.rng;
    const t = this.time;
    const ph = this.phase;
    const source = dir > 0 ? sim.topCount : sim.bottomCount;
    // Al final de la sesión el chorro se adelgaza hasta cortarse.
    const flow = Math.min(1, source / THIN_BELOW);
    const intensity = clamp01(Number.isFinite(input.intensity) ? input.intensity : 0.6);
    // Ritmo irregular: ruido lento (suma de senos con fases aleatorias) que
    // a ratos casi corta el chorro y a ratos lo espesa → huecos naturales.
    const burst = 0.35 + 0.5 * Math.sin(t * 7.3 + ph[0]!) + 0.35 * Math.sin(t * 19.7 + ph[1]!);
    // Con mucho caudal no hay huecos: el ritmo apenas oscila y hay más granos.
    const c = streamContinuity(input.flowRate);
    const pulse = (1 - c) * Math.max(0.04, burst) + c * (0.85 + 0.15 * Math.sin(t * 11.1 + ph[0]!));
    const calmK = input.calm ? 0.45 : 1;
    const rate = BASE_RATE * (0.45 + 0.55 * intensity) * (1 + 1.3 * c) * flow * pulse * calmK;
    // Ancho que tiembla un poco (y se estrecha al final).
    const width =
      (0.7 + 0.3 * Math.sin(t * 5.3 + ph[2]!) + 0.15 * Math.sin(t * 17.9 + ph[3]!)) *
      (0.5 + 0.5 * flow) *
      (1 + 0.3 * c) *
      (input.calm ? 0.6 : 1);

    const ex = sim.centerCol + 0.5;
    const ey = sim.gateRow + 0.5 + dir * 0.9;
    this.emitDebt += rate * dt;
    while (this.emitDebt >= 1) {
      this.emitDebt -= 1;
      const i = this.spawn(PARTICLE_FALL);
      if (i < 0) break;
      this.emitted++;
      const off = (rng() - 0.5) * 2 * width;
      // Perpendicular a la gravedad (para que funcione también inclinado).
      this.x[i] = ex - g.y * off * dir + g.x * rng() * 0.6;
      this.y[i] = ey + g.x * off * dir + g.y * rng() * 0.6;
      const v0 = 3 + rng() * 9;
      // Algún grano se separa un poco del chorro (4 %).
      const stray = rng() < (input.calm ? 0.01 : 0.04) ? 3.5 : 1;
      const side = (rng() - 0.5) * 2.2 * stray;
      this.vx[i] = g.x * v0 - g.y * side * dir;
      this.vy[i] = g.y * v0 + g.x * side * dir;
      this.accel[i] = 0.8 + 0.2 * rng();
      this.life[i] = 3;
      this.size[i] = 0.22 + 0.16 * rng();
      this.tone[i] = 1 + Math.floor(rng() * 254);
    }

    // Remolino en la boca del embudo (solo con el chorro "lleno").
    if (input.calm) return;
    this.swirlDebt += 28 * flow * dt;
    while (this.swirlDebt >= 1) {
      this.swirlDebt -= 1;
      const i = this.spawn(PARTICLE_SWIRL);
      if (i < 0) break;
      const side = rng() < 0.5 ? -1 : 1;
      const r = 1.2 + rng() * 2.6;
      this.x[i] = sim.centerCol + 0.5 + side * r;
      this.y[i] = sim.gateRow + 0.5 - dir * (0.6 + rng() * 2.2);
      // Hacia el centro del cuello, con un giro (componente tangencial).
      const speed = 5 + rng() * 7;
      this.vx[i] = -side * speed * 0.8;
      this.vy[i] = dir * speed * (0.5 + rng() * 0.5);
      this.accel[i] = 0.25;
      this.life[i] = 0.25 + rng() * 0.25;
      this.size[i] = 0.28 + 0.2 * rng();
      this.tone[i] = 1 + Math.floor(rng() * 254);
    }
  }

  // ───────────────────────── movimiento ─────────────────────────

  private integrate(sim: SandSimulation, g: Vec2, dir: number, dt: number, calm: boolean): void {
    const { x, y, vx, vy, life, accel, kind } = this;
    const neckX = sim.centerCol + 0.5;
    const neckY = sim.gateRow + 0.5;
    let i = 0;
    while (i < this.count) {
      life[i] = life[i]! - dt;
      if (life[i]! <= 0) {
        this.remove(i);
        continue;
      }
      const k = kind[i]!;

      if (k === PARTICLE_ROLL) {
        if (!this.roll(sim, i, dir, dt)) {
          this.remove(i);
          continue;
        }
        i++;
        continue;
      }

      const a = GRAVITY * accel[i]!;
      vx[i] = vx[i]! + g.x * a * dt;
      vy[i] = vy[i]! + g.y * a * dt;
      if (k === PARTICLE_SWIRL) {
        // Se curva hacia el cuello; al llegar, se une al chorro.
        vx[i] = vx[i]! + (neckX - x[i]!) * 40 * dt;
        vy[i] = vy[i]! * (1 - 2 * dt);
      }
      const px = x[i]!;
      const py = y[i]!;
      const nx = px + vx[i]! * dt;
      const ny = py + vy[i]! * dt;
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
        this.remove(i);
        continue;
      }

      if (k === PARTICLE_SWIRL) {
        if ((ny - neckY) * dir > -0.4) {
          // Entra en el cuello: pasa a ser un grano del chorro.
          kind[i] = PARTICLE_FALL;
          x[i] = neckX + (nx - neckX) * 0.3;
          y[i] = neckY + dir * 0.9;
          vx[i] = vx[i]! * 0.15;
          vy[i] = g.y * 8;
          accel[i] = 0.8 + 0.2 * this.rng();
          life[i] = 3;
        } else {
          x[i] = nx;
          y[i] = ny;
        }
        i++;
        continue;
      }

      // Colisión con la arena o el vidrio (en el bulbo de destino).
      const col = Math.floor(nx);
      const row = Math.floor(ny);
      if (col < 0 || row < 0 || col >= sim.cols || row >= sim.rows) {
        this.remove(i);
        continue;
      }
      const idx = row * sim.cols + col;
      const pastNeck = (row - sim.gateRow) * dir > 0;
      if (pastNeck && sim.mask[idx] !== 1) {
        this.remove(i);
        continue;
      }
      if (pastNeck && sim.cells[idx] !== 0) {
        if (k === PARTICLE_FALL && !calm && this.rng() < 0.16) {
          this.splash(i, px, py, g);
          i++;
          continue;
        }
        if (k === PARTICLE_HOP) {
          // Se posa en la superficie y empieza a rodar.
          kind[i] = PARTICLE_ROLL;
          x[i] = Math.floor(px) + 0.5;
          y[i] = Math.floor(py) + 0.5;
          vx[i] = vx[i]! >= 0 ? 1 : -1;
          vy[i] = 0;
          life[i] = Math.min(life[i]!, 0.6);
          i++;
          continue;
        }
        this.remove(i);
        continue;
      }
      x[i] = nx;
      y[i] = ny;
      i++;
    }
  }

  /** Convierte el grano que impacta en un rebote corto. */
  private splash(i: number, px: number, py: number, g: Vec2): void {
    const rng = this.rng;
    this.kind[i] = PARTICLE_HOP;
    this.x[i] = px;
    this.y[i] = py - g.y * 0.6;
    const side = (rng() < 0.5 ? -1 : 1) * (5 + rng() * 9);
    const up = 6 + rng() * 9;
    this.vx[i] = side * Math.abs(g.y) - g.x * up;
    this.vy[i] = -g.y * up + side * g.x;
    this.accel[i] = 1;
    this.life[i] = 0.9;
  }

  /**
   * Rodar ladera abajo: cada cierto tiempo intenta bajar en diagonal hacia
   * el lado al que iba. Si no puede, se queda quieto (se "funde" con la
   * arena) y desaparece. Devuelve false si debe eliminarse.
   */
  private roll(sim: SandSimulation, i: number, dir: number, dt: number): boolean {
    // vy guarda el temporizador del siguiente paso de rodadura.
    this.vy[i] = this.vy[i]! - dt;
    if (this.vy[i]! > 0) return true;
    this.vy[i] = 0.035 + this.rng() * 0.03;
    const side = this.vx[i]! >= 0 ? 1 : -1;
    const col = Math.floor(this.x[i]!) + side;
    const row = Math.floor(this.y[i]!) + dir;
    if (col < 0 || col >= sim.cols || row < 0 || row >= sim.rows) return false;
    const idx = row * sim.cols + col;
    if (sim.mask[idx] !== 1 || sim.cells[idx] !== 0) return false;
    this.x[i] = col + 0.5;
    this.y[i] = row + 0.5;
    return true;
  }

  // ───────────────────────── gestión de huecos ─────────────────────────

  /** Reserva una partícula (o -1 si no hay sitio). */
  private spawn(kind: number): number {
    if (this.count >= this.capacity) return -1;
    const i = this.count++;
    this.kind[i] = kind;
    return i;
  }

  /** Elimina la partícula i moviendo la última a su sitio (sin huecos). */
  private remove(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last]!;
    this.y[i] = this.y[last]!;
    this.vx[i] = this.vx[last]!;
    this.vy[i] = this.vy[last]!;
    this.life[i] = this.life[last]!;
    this.accel[i] = this.accel[last]!;
    this.size[i] = this.size[last]!;
    this.kind[i] = this.kind[last]!;
    this.tone[i] = this.tone[last]!;
  }
}

/**
 * 0..1: cuánto de «hilo continuo» tiene el chorro según el caudal real.
 * 0 con poco caudal (≤ 20 granos/s: el chorro de siempre, con huecos), 1 con
 * mucho (≥ 180 granos/s), en escala logarítmica. Antes el aspecto solo
 * dependía de la duración, así que un bulbo LLENO vaciándose en un minuto
 * (fase de un ciclo) se veía igual de punteado que uno casi vacío.
 */
export function streamContinuity(flowRate: number | undefined): number {
  if (flowRate === undefined || !(flowRate > SPARSE_FLOW)) return 0;
  return clamp01(Math.log(flowRate / SPARSE_FLOW) / Math.log(DENSE_FLOW / SPARSE_FLOW));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
