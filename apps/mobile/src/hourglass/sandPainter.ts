/**
 * Pintor de la arena: convierte el estado de la simulación en un SkPicture.
 *
 * Pasos en cada fotograma:
 *  1. Copiar la rejilla de granos a un buffer RGBA (1 píxel por celda) usando
 *     una tabla de colores (LUT) precalculada a partir de la paleta.
 *  2. Crear con él una imagen de Skia y pasarla al shader de arena, que la
 *     convierte en granos redondeados con luz y sombra.
 *  3. Dibujar los granos sueltos del chorro (partículas de StreamParticles,
 *     del core): caen acelerando, giran en la boca del embudo y salpican
 *     al chocar con el montón. Además, en el cuello, los granos de las
 *     últimas filas "parpadean" (cobertura parcial cambiante) para que el
 *     borde del embudo se vea granular y en movimiento, no una línea recta.
 *
 * MEMORIA (muy importante en web, donde CanvasKit vive en WebAssembly):
 *  - Los Paint, el PictureRecorder, los rectángulos, el color y los buffers
 *    se crean UNA vez en el constructor y se reutilizan en cada fotograma.
 *    El color de cada grano del chorro se escribe en un Float32Array fijo
 *    (no se crea un SkColor por grano).
 *  - Lo único que nace en cada fotograma es lo que Skia no permite reutilizar
 *    porque es inmutable: la imagen de la rejilla (sus píxeles cambian), los
 *    dos shaders que la envuelven y el SkPicture final. Los tres primeros se
 *    liberan en cuanto termina la grabación (el picture guarda su propia
 *    referencia) y el picture lo libera useSandEngine al sustituirlo.
 *  - `dispose()` libera los objetos persistentes al desmontar el reloj.
 */
import {
  hash32,
  PARTICLE_FALL,
  PARTICLE_SWIRL,
  type ContentPalette,
  type HourglassModel,
  type SandSimulation,
  type StreamParticles,
  type Vec2,
} from '@reloj/core';
import {
  AlphaType,
  ClipOp,
  ColorType,
  FilterMode,
  MipmapMode,
  Skia,
  TileMode,
  type ImageInfo,
  type SkCanvas,
  type SkPaint,
  type SkPicture,
  type SkPictureRecorder,
  type SkRect,
  type SkRuntimeEffect,
} from '@shopify/react-native-skia';

import type { HourglassTheme } from '../theme/theme';
import { safeDispose } from './disposal';
import type { HourglassLayout } from './layout';
import type { ShaderSet } from './resources';
import { profileUniforms } from './shaders/profileUniforms';
import { UniformPacker } from './shaders/uniforms';
import type { PhysicalInputs } from './types';

/** Estado del chorro de arena para dibujarlo. */
export interface StreamState {
  /** ¿Pasa arena por el cuello ahora mismo? (anima el borde del embudo) */
  flowing: boolean;
  /** Granos sueltos del chorro (o null si no hay). */
  particles: StreamParticles | null;
  /** Versión calmada (accesibilidad: reducir movimiento). */
  reduceMotion: boolean;
}

/** Construye la tabla tono → color (256 entradas RGB). */
export function buildPaletteLut(palette: ContentPalette): Uint8Array {
  const lut = new Uint8Array(256 * 3);
  const tones = palette.grainTones;
  // Tono medio: acercamos cada grano a él para que la arena no parezca un
  // mosaico (la variación fina la añade el shader con sus microgranos).
  const mean = [0, 1, 2].map((c) => tones.reduce((sum, t) => sum + t[c]!, 0) / tones.length);
  // 1.4: 0.6 → 0.75, algo más de variedad de tonos entre granos (sigue
  // siendo sutil; el tono de cada grano lo fija la simulación al crearlo y
  // viaja con él, así que no parpadea).
  const CONTRAST = 0.75;
  for (let t = 1; t < 256; t++) {
    const h = hash32(t * 977);
    let rgb: readonly number[];
    if ((h % 1000) / 1000 < palette.speckRatio) {
      rgb = palette.speck;
    } else {
      // Mezclamos dos tonos vecinos de la paleta para tener mucha variedad.
      const a = tones[h % tones.length]!;
      const b = tones[(h >>> 8) % tones.length]!;
      const k = ((h >>> 16) & 255) / 255;
      rgb = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    for (let c = 0; c < 3; c++) {
      lut[t * 3 + c] = Math.round(mean[c]! + (rgb[c]! - mean[c]!) * CONTRAST);
    }
  }
  return lut;
}

/** Fracción de tonos (y por tanto de granos) que destellan al inclinar. */
export const SPARKLE_RATIO = 0.05;
/**
 * Alfa con el que se marcan los granos "con destello" en la imagen de la
 * rejilla. 254 en vez de 255: el shader lo trata como celda llena pero sabe
 * que debe darle un brillo de cuarzo (ver shaders/sand.ts).
 */
export const SPARKLE_ALPHA = 254;

/**
 * Tabla tono → alfa (256 entradas): 255 normal, SPARKLE_ALPHA para el ~5 %
 * de los tonos. Como cada grano conserva su tono, los que destellan son
 * siempre los mismos granos (estable, sin parpadeo).
 */
export function buildSparkleAlpha(ratio = SPARKLE_RATIO): Uint8Array {
  const table = new Uint8Array(256).fill(255);
  for (let t = 1; t < 256; t++) {
    if ((hash32(t * 7919 + 13) % 1000) / 1000 < ratio) table[t] = SPARKLE_ALPHA;
  }
  return table;
}

export class SandPainter {
  // ── Buffers y objetos persistentes (se crean una vez) ──
  private readonly pixels: Uint8Array;
  /** Tono → alfa (marca los granos con destello). Se calcula una vez. */
  private readonly sparkleAlpha = buildSparkleAlpha();
  private readonly imageInfo: ImageInfo;
  private readonly recorder: SkPictureRecorder;
  private readonly bounds: SkRect;
  private readonly gridRect: SkRect;
  private readonly sandPaint: SkPaint;
  private readonly grainPaint: SkPaint;
  private readonly glintPaint: SkPaint;
  /** Color reutilizable (RGBA 0..1) para cada grano del chorro. */
  private readonly color = new Float32Array(4);
  /** Contador de fotogramas (anima el borde del cuello). */
  private frame = 0;
  private readonly sand: SkRuntimeEffect;
  private readonly packer: UniformPacker;
  /** Valores de uniforms: arrays fijos que se rellenan en sitio. */
  private readonly uniforms: {
    uCenter: number[];
    uHalf: number[];
    uProfile: number[];
    uShape: number[];
    uOrigin: number[];
    uCell: number;
    uGridSize: number[];
    uLight: number[];
    uGravity: number[];
    uExposure: number;
  };
  private disposed = false;

  constructor(
    private readonly layout: HourglassLayout,
    model: HourglassModel,
    private readonly theme: HourglassTheme,
    private readonly lut: Uint8Array,
    shaders: ShaderSet,
  ) {
    this.pixels = new Uint8Array(layout.cols * layout.rows * 4);
    this.imageInfo = {
      width: layout.cols,
      height: layout.rows,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    };
    this.recorder = Skia.PictureRecorder();
    this.bounds = Skia.XYWHRect(0, 0, layout.width, layout.height);
    this.gridRect = Skia.XYWHRect(
      layout.gridX,
      layout.gridY,
      layout.cols * layout.cell,
      layout.rows * layout.cell,
    );

    this.sand = shaders.sand;
    this.packer = new UniformPacker(this.sand);
    const profile = profileUniforms(layout, model);
    this.uniforms = {
      uCenter: [...profile.uCenter],
      uHalf: [...profile.uHalf],
      uProfile: [...profile.uProfile],
      uShape: [...profile.uShape],
      uOrigin: [layout.gridX, layout.gridY],
      uCell: layout.cell,
      uGridSize: [layout.cols, layout.rows],
      uLight: [0, 0],
      uGravity: [0, 1],
      uExposure: theme.sand.exposure,
    };

    this.sandPaint = Skia.Paint();

    this.grainPaint = Skia.Paint();
    this.grainPaint.setAntiAlias(true);
    // Brillo diminuto de cada grano (cuarzo) para que no parezcan puntos planos.
    this.glintPaint = Skia.Paint();
    this.glintPaint.setAntiAlias(true);
    this.glintPaint.setColor(Skia.Color('rgba(255, 250, 238, 0.55)'));
  }

  /** Graba un SkPicture con la arena y el chorro. */
  paint(sim: SandSimulation, inputs: PhysicalInputs, stream: StreamState): SkPicture {
    if (this.disposed) throw new Error('SandPainter usado después de dispose()');
    const { layout } = this;
    this.frame = (this.frame + 1) % 1_000_000;
    this.compose(sim, inputs.gravity, stream.flowing && !stream.reduceMotion);

    const canvas = this.recorder.beginRecording(this.bounds);

    // Objetos de este fotograma (inmutables en Skia): se liberan abajo.
    const data = Skia.Data.fromBytes(this.pixels);
    const image = Skia.Image.MakeImage(this.imageInfo, data, layout.cols * 4);
    const grid = image?.makeShaderOptions(
      TileMode.Decal,
      TileMode.Decal,
      FilterMode.Nearest,
      MipmapMode.None,
    );
    let shader = null;
    if (grid) {
      const u = this.uniforms;
      u.uLight[0] = inputs.tilt.x;
      u.uLight[1] = inputs.tilt.y;
      u.uGravity[0] = inputs.gravity.x;
      u.uGravity[1] = inputs.gravity.y;
      shader = this.sand.makeShaderWithChildren(this.packer.pack(u), [grid]);
      this.sandPaint.setShader(shader);
      canvas.save();
      canvas.clipPath(layout.innerPath, ClipOp.Intersect, true);
      canvas.drawRect(this.gridRect, this.sandPaint);
      if (stream.particles?.active) this.drawParticles(canvas, stream.particles, inputs.tilt);
      canvas.restore();
    }

    const picture = this.recorder.finishRecordingAsPicture();
    // El picture ya guarda su propia referencia: soltamos las nuestras.
    this.sandPaint.setShader(null);
    safeDispose(shader);
    safeDispose(grid);
    safeDispose(image);
    safeDispose(data);
    return picture;
  }

  /** Libera los objetos persistentes (al desmontar o cambiar de tamaño/tema). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    safeDispose(this.sandPaint);
    safeDispose(this.grainPaint);
    safeDispose(this.glintPaint);
    safeDispose(this.recorder);
  }

  /**
   * Copia la rejilla al buffer RGBA usando la LUT.
   *
   * Alfa 255 = celda con grano. Además, las celdas VACÍAS que forman la
   * esquina de un escalón de la superficie (tienen arena debajo y a un lado)
   * reciben un alfa parcial (1..254) = "cobertura": el shader dibuja solo
   * algunos de sus microgranos, así la pendiente del montón no se ve como
   * una escalera de píxeles sino como un borde irregular y natural.
   */
  private compose(sim: SandSimulation, gravity: Vec2, flowing: boolean): void {
    const { cells, mask, cols } = sim;
    const px = this.pixels;
    const lut = this.lut;
    const alpha = this.sparkleAlpha;
    const n = Math.min(cells.length, px.length >> 2);
    // Dirección "abajo" en la rejilla (redondeada al eje dominante).
    const ax = Math.abs(gravity.x);
    const ay = Math.abs(gravity.y);
    const down = ay >= ax ? (gravity.y >= 0 ? cols : -cols) : gravity.x >= 0 ? 1 : -1;
    const side = ay >= ax ? 1 : cols;
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      const tone = cells[i]!;
      if (tone !== 0) {
        const l = tone * 3;
        px[o] = lut[l]!;
        px[o + 1] = lut[l + 1]!;
        px[o + 2] = lut[l + 2]!;
        px[o + 3] = alpha[tone]!;
        continue;
      }
      px[o + 3] = 0;
      if (mask[i] !== 1) continue;
      const below = cells[i + down] ?? 0;
      if (below === 0) continue;
      const a = (cells[i - side] ?? 0) !== 0 ? 1 : 0;
      const b = (cells[i + side] ?? 0) !== 0 ? 1 : 0;
      if (a + b === 0) continue;
      // Esquina de escalón: copiamos el color del grano de debajo.
      const l = below * 3;
      px[o] = lut[l]!;
      px[o + 1] = lut[l + 1]!;
      px[o + 2] = lut[l + 2]!;
      px[o + 3] = a + b === 2 ? 170 : 96;
    }
    if (flowing) this.flickerNeck(sim, gravity);
  }

  /**
   * Borde del embudo vivo: en las últimas filas antes del cuello, cada
   * fotograma (cada dos, para que no sea nervioso) algunos granos se dibujan
   * solo en parte. El resultado es un borde irregular que "hierve" como la
   * arena que se escurre, en vez de un corte recto perfecto.
   */
  private flickerNeck(sim: SandSimulation, gravity: Vec2): void {
    const { cells, cols } = sim;
    const px = this.pixels;
    const dir = gravity.y >= 0 ? 1 : -1;
    const center = Math.round(sim.centerCol);
    const tick = this.frame >> 1;
    for (let k = 1; k <= 4; k++) {
      const row = sim.gateRow - dir * k;
      if (row < 0 || row >= sim.rows) continue;
      const half = 1 + k; // el embudo se abre hacia arriba
      for (let c = center - half; c <= center + half; c++) {
        if (c < 0 || c >= cols) continue;
        const i = row * cols + c;
        if (cells[i] === 0) continue;
        const h = hash32(i * 2654435 + tick * 97) % 1000;
        // Más "agitado" cuanto más cerca del cuello.
        const chance = 520 - k * 90;
        if (h < chance) px[i * 4 + 3] = 70 + (h % 120);
      }
    }
  }

  /**
   * Granos sueltos del chorro, del remolino del embudo y de las salpicaduras.
   * Solo órdenes de dibujo sobre Paints persistentes: ningún objeto Skia nuevo.
   */
  private drawParticles(canvas: SkCanvas, particles: StreamParticles, tilt: Vec2): void {
    const { layout, lut, color } = this;
    const { x, y, size, tone, kind, count } = particles;
    const cell = layout.cell;
    const ox = layout.gridX;
    const oy = layout.gridY;
    // El brillo se desplaza hacia la luz (arriba a la izquierda, y con la inclinación).
    const gx = (-0.28 + tilt.x * 0.2) * cell;
    const gy = (-0.32 + tilt.y * 0.2) * cell;
    for (let i = 0; i < count; i++) {
      const px = ox + x[i]! * cell;
      const py = oy + y[i]! * cell;
      const r = size[i]! * cell;
      if (!Number.isFinite(px) || !Number.isFinite(py) || !(r > 0)) continue;
      const l = tone[i]! * 3;
      // Los granos sueltos se ven algo más oscuros que la masa iluminada.
      const shade = kind[i] === PARTICLE_SWIRL ? 0.86 : 0.8;
      color[0] = (lut[l]! / 255) * shade;
      color[1] = (lut[l + 1]! / 255) * shade;
      color[2] = (lut[l + 2]! / 255) * shade;
      color[3] = kind[i] === PARTICLE_FALL ? 0.95 : 0.9;
      this.grainPaint.setColor(color);
      canvas.drawCircle(px, py, r, this.grainPaint);
      if (r > cell * 0.36) canvas.drawCircle(px + gx * 0.5, py + gy * 0.5, r * 0.38, this.glintPaint);
    }
  }
}
