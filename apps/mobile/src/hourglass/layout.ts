/**
 * Cálculo de la geometría en píxeles: dónde va el reloj, su tamaño, la
 * rejilla de la simulación y los trazados (paths) del vidrio.
 */
import { outlinePoints, SandSimulation, type HourglassModel } from '@reloj/core';
import { Skia, type SkPath } from '@shopify/react-native-skia';

/** Tamaño objetivo de un grano en píxeles lógicos (dp). */
const TARGET_CELL_PX = 2.2;

export interface HourglassLayout {
  readonly width: number;
  readonly height: number;
  /** Centro del reloj (el cuello). */
  readonly cx: number;
  readonly cy: number;
  /** Semiancho y semialto del reloj, en px. */
  readonly halfW: number;
  readonly halfH: number;
  /** Rejilla de la simulación. */
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly gridX: number;
  readonly gridY: number;
  /** Contorno exterior del vidrio y hueco interior. */
  readonly outerPath: SkPath;
  readonly innerPath: SkPath;
}

export interface LayoutInsets {
  readonly top: number;
  readonly bottom: number;
}

/** Tamaño mínimo (dp) con el que tiene sentido dibujar el reloj. */
export const MIN_CANVAS_SIZE = 48;

/** ¿Es un tamaño de lienzo válido? (finito y no diminuto) */
export function isUsableSize(width: number, height: number): boolean {
  return (
    Number.isFinite(width) && Number.isFinite(height) && width >= MIN_CANVAS_SIZE && height >= MIN_CANVAS_SIZE
  );
}

export function computeLayout(
  width: number,
  height: number,
  model: HourglassModel,
  insets: LayoutInsets,
): HourglassLayout {
  if (!isUsableSize(width, height)) {
    throw new Error(`Tamaño de lienzo no válido: ${width}x${height}`);
  }
  const { profile } = model;
  const safeTop = finiteOr(insets.top, 0);
  const safeBottom = finiteOr(insets.bottom, 0);
  insets = { top: safeTop, bottom: safeBottom };
  const available = Math.max(100, height - insets.top - insets.bottom);
  // Altura deseada del reloj y límite por el ancho de la pantalla.
  let halfH = (available * model.screenHeightRatio) / 2;
  let halfW = halfH / profile.halfHeightRatio;
  const maxHalfW = width * 0.36;
  if (halfW > maxHalfW) {
    halfW = maxHalfW;
    halfH = halfW * profile.halfHeightRatio;
  }

  // Ajustamos al número entero de celdas de la simulación.
  const { cols, rows } = SandSimulation.dimensions(profile, (2 * halfW) / TARGET_CELL_PX);
  const cell = (2 * halfW) / cols;
  halfH = (rows * cell) / 2;

  const cx = width / 2;
  // Centrado en el espacio disponible, un poco por encima del centro óptico.
  const cy = insets.top + available / 2 - available * 0.015;

  return {
    width,
    height,
    cx,
    cy,
    halfW,
    halfH,
    cols,
    rows,
    cell,
    gridX: cx - halfW,
    gridY: cy - halfH,
    outerPath: buildPath(model, cx, cy, halfW, halfH, false),
    innerPath: buildPath(model, cx, cy, halfW, halfH, true),
  };
}

/** Construye un path cerrado y simétrico a partir del perfil del core. */
function buildPath(
  model: HourglassModel,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  inner: boolean,
): SkPath {
  const pts = outlinePoints(model.profile, 220, inner);
  // Validamos ANTES de tocar Skia: un NaN en lineTo puede corromper CanvasKit.
  for (const p of pts) {
    if (!Number.isFinite(cx + p.x * halfW) || !Number.isFinite(cy + p.y * halfH)) {
      throw new Error('Contorno del reloj con coordenadas no finitas');
    }
  }
  const b = Skia.PathBuilder.Make();
  try {
    pts.forEach((p, i) => {
      const x = cx + p.x * halfW;
      const y = cy + p.y * halfH;
      if (i === 0) b.moveTo(x, y);
      else b.lineTo(x, y);
    });
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i]!;
      b.lineTo(cx - p.x * halfW, cy + p.y * halfH);
    }
    b.close();
    return b.build();
  } finally {
    // El builder es temporal: el path construido es independiente.
    b.dispose();
  }
}

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}
