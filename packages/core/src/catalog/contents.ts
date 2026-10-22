/**
 * Catálogo de contenidos: lo que hay dentro del reloj.
 *
 * Fase 1: solo arena. El tipo ya distingue entre contenido granular (arena,
 * se simula grano a grano) y fluido (agua, fase futura) para que el
 * renderizador pueda elegir la simulación adecuada sin cambiar la app.
 */

export type ContentKind = 'granular' | 'fluid';

/** Color RGB en 0..255. */
export type Rgb = readonly [number, number, number];

export interface ContentPalette {
  /** Tonos de los granos (se mezclan al azar para dar textura). */
  readonly grainTones: readonly Rgb[];
  /** Tono de los granos oscuros ocasionales ("motas"). */
  readonly speck: Rgb;
  /** Proporción de motas (0..1). */
  readonly speckRatio: number;
}

export interface ContentDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind: ContentKind;
  /** Paleta para tema claro y oscuro. */
  readonly palette: { readonly light: ContentPalette; readonly dark: ContentPalette };
  /**
   * Tendencia a deslizar lateralmente (0..1). Controla el ángulo de reposo:
   * más alto = montones más planos.
   */
  readonly slideChance: number;
  /** Fracción de la capacidad del bulbo que ocupa toda la arena. */
  readonly fillRatio: number;
}

export const SAND: ContentDefinition = {
  id: 'arena',
  name: 'Arena',
  kind: 'granular',
  palette: {
    light: {
      grainTones: [
        [214, 192, 158],
        [204, 179, 141],
        [224, 205, 174],
        [196, 170, 131],
        [230, 214, 188],
      ],
      speck: [150, 124, 96],
      speckRatio: 0.025,
    },
    dark: {
      grainTones: [
        [186, 160, 124],
        [172, 146, 110],
        [198, 175, 141],
        [160, 134, 100],
        [206, 186, 155],
      ],
      speck: [112, 92, 70],
      speckRatio: 0.025,
    },
  },
  slideChance: 0.55,
  fillRatio: 0.86,
};

/** Registro de contenidos disponibles. El agua se añadirá aquí en su fase. */
export const CONTENT_CATALOG: readonly ContentDefinition[] = [SAND];

export const DEFAULT_CONTENT_ID = SAND.id;

/** Busca un contenido por id; si no existe devuelve el de por defecto. */
export function getContent(id: string | undefined | null): ContentDefinition {
  return CONTENT_CATALOG.find((c) => c.id === id) ?? SAND;
}
