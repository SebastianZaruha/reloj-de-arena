/**
 * Catálogo de modelos de reloj de arena.
 *
 * Un modelo describe la geometría (perfil) y el aspecto del vidrio. El
 * renderizador actual es "2.5D" (dibujo 2D con sombreadores que imitan el
 * volumen). El campo `renderer` permite, en el futuro, registrar un modelo
 * 3D real sin tocar el resto de la app.
 */
import type { HourglassProfile } from '../geometry/profile';

export type HourglassRenderer = '2.5d' | '3d';

export interface GlassAppearance {
  /** Intensidad del brillo de borde (efecto Fresnel). 0..1 */
  readonly rimStrength: number;
  /** Intensidad de los reflejos especulares. 0..1 */
  readonly specularStrength: number;
  /** Desplazamiento máximo de la refracción del fondo, en px. */
  readonly refraction: number;
  /** Opacidad del tinte del cristal. 0..1 */
  readonly tint: number;
}

export interface HourglassModel {
  readonly id: string;
  readonly name: string;
  readonly renderer: HourglassRenderer;
  readonly profile: HourglassProfile;
  readonly glass: GlassAppearance;
  /** Proporción del alto de pantalla que ocupa el reloj (0..1). */
  readonly screenHeightRatio: number;
}

export const CLASSIC_MODEL: HourglassModel = {
  id: 'clasico',
  name: 'Clásico',
  renderer: '2.5d',
  profile: {
    halfHeightRatio: 2.3,
    bulbCenter: 0.52,
    bulbRadiusY: 0.49,
    neckRadius: 0.045,
    fillet: 0.14,
    egg: 0.3,
    taper: 1.9,
    wallThickness: 0.024,
  },
  glass: {
    rimStrength: 0.75,
    specularStrength: 0.8,
    refraction: 7,
    tint: 0.06,
  },
  screenHeightRatio: 0.66,
};

export const HOURGLASS_CATALOG: readonly HourglassModel[] = [CLASSIC_MODEL];

export const DEFAULT_MODEL_ID = CLASSIC_MODEL.id;

/** Busca un modelo por id; si no existe devuelve el clásico. */
export function getHourglassModel(id: string | undefined | null): HourglassModel {
  return HOURGLASS_CATALOG.find((m) => m.id === id) ?? CLASSIC_MODEL;
}
