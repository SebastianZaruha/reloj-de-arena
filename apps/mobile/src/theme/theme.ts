/**
 * Paletas de color de la app (tema claro y oscuro).
 *
 * Tonos cálidos beige / gris piedra inspirados en las fotos de referencia.
 * Los colores del renderizador se expresan como [r, g, b] en 0..1 porque
 * así los consumen directamente los shaders de Skia.
 */
import type { Rgb } from '@reloj/core';

export type ColorSchemeName = 'light' | 'dark';

/** Color en formato shader: componentes 0..1. */
export type Rgb01 = readonly [number, number, number];

export interface HourglassTheme {
  readonly scheme: ColorSchemeName;
  /** Fondo: degradado vertical + luz cálida difusa + viñeta. */
  readonly background: {
    readonly top: Rgb01;
    readonly bottom: Rgb01;
    readonly glow: Rgb01;
    readonly glowPos: readonly [number, number];
    readonly vignette: Rgb01;
  };
  /** Vidrio. */
  readonly glass: {
    /** Color por el que se multiplica lo que se ve a través del vidrio. */
    readonly tint: Rgb01;
    /** Intensidad de los reflejos (1 = normal). */
    readonly reflection: number;
    /** Color de la línea del contorno. */
    readonly edge: string;
    /** Color del brillo interior del contorno. */
    readonly edgeHighlight: string;
  };
  /** Sombra proyectada sobre la "mesa". */
  readonly shadow: { readonly color: string; readonly contact: string; readonly caustic: string };
  /** Arena: multiplicador de luz y tono del chorro. */
  readonly sand: { readonly exposure: number; readonly stream: string };
  /** Texto (tiempo) y pistas: tonos muy cercanos al fondo, poco contraste. */
  readonly text: {
    readonly time: string;
    readonly hint: string;
    /** Rótulo «Pausa» (1.3.1): algo más contrastado que el tiempo. */
    readonly pause: string;
    /** Halo suave detrás de «Pausa», para separarlo del reloj desenfocado. */
    readonly pauseGlow: string;
  };
  /** Color sólido aproximado del fondo (barra de estado, splash...). */
  readonly solid: string;
  /** Menú de ajustes (1.5): botón, hoja de vidrio esmerilado y controles. */
  readonly ui: UiPalette;
}

/**
 * Colores del menú. Los textos cumplen contraste WCAG AA (≥ 4.5:1) sobre la
 * hoja; el icono del botón y el interruptor activo, ≥ 3:1 (elementos no
 * textuales). Medido sobre el color medio de la hoja (claro ≈ #F1ECE6,
 * oscuro ≈ #221D19):
 *
 * | Token     | Claro   | Ratio | Oscuro  | Ratio |
 * | --------- | ------- | ----- | ------- | ----- |
 * | ink       | #4F443B | 8.0   | #E8DCCB | 12.3  |
 * | inkSoft   | #6B5E53 | 5.3   | #B9AB9C | 7.4   |
 * | label     | #716458 | 4.9   | #A39586 | 5.7   |
 * | accent    | #8C7660 | 3.7   | #B59D80 | 6.4   |
 * | menuIcon  | #8F8272 | 3.0*  | #796C60 | 3.4*  |
 *
 * (*) sobre el fondo de la pantalla, no sobre la hoja.
 */
export interface UiPalette {
  /** Texto principal (títulos, opción elegida). */
  readonly ink: string;
  /** Texto secundario (opciones no elegidas, unidades). */
  readonly inkSoft: string;
  /** Rótulos de sección (MAYÚSCULAS pequeñas). */
  readonly label: string;
  /** Fondo de pistas y botones no elegidos. */
  readonly track: string;
  /** Fondo de la opción elegida (una «píldora» clara que flota). */
  readonly pill: string;
  /** Sombra de la píldora (sintaxis CSS `boxShadow`). */
  readonly pillShadow: string;
  /** Interruptor activado. */
  readonly accent: string;
  /** Interruptor desactivado. */
  readonly toggleOff: string;
  /** Bolita del interruptor. */
  readonly knob: string;
  /** Líneas separadoras finas. */
  readonly line: string;
  /** Tinte del vidrio esmerilado de la hoja (encima del desenfoque). */
  readonly panelTint: string;
  /** Brillo del canto superior de la hoja. */
  readonly panelEdge: string;
  /** Velo muy suave sobre el reloj con el menú abierto. */
  readonly scrim: string;
  /** Asa de la hoja. */
  readonly grabber: string;
  /** Las dos rayitas del botón de menú. */
  readonly menuIcon: string;
}

const hex = (h: string): Rgb01 => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * COLOR OFICIAL DEL FONDO CLARO: un único token.
 *
 * Todo el fondo del tema claro (degradado, luz difusa, viñeta y color
 * sólido de la barra de estado) se deriva de este valor con desplazamientos
 * fijos, así que para probar otro tono basta con cambiar esta línea.
 * Elegido por Sebastián en la 1.2.1: la variante D (más claro). Con '#E2D9CE'
 * (variante A) se obtienen exactamente los colores de las versiones 1.0/1.1:
 * arriba #ECE5DC, abajo #D6CBBE, luz #F8F3EC, viñeta #BFB1A2.
 * (Variantes comparadas en docs/capturas/07-fondos-claros.png.)
 */
export const LIGHT_BACKGROUND = '#EBE5DD';

/** Desplazamientos RGB (0..255) respecto al token, para cada parte del fondo. */
const LIGHT_OFFSETS = {
  top: [10, 12, 14],
  bottom: [-12, -14, -16],
  glow: [22, 26, 30],
  vignette: [-35, -40, -44],
} as const;

/** Suma un desplazamiento RGB a un color hex y lo devuelve en 0..1. */
function shift(base: string, d: readonly number[]): Rgb01 {
  const n = parseInt(base.slice(1), 16);
  const ch = (v: number, k: number) => Math.min(255, Math.max(0, v + (d[k] ?? 0))) / 255;
  return [ch((n >> 16) & 255, 0), ch((n >> 8) & 255, 1), ch(n & 255, 2)];
}

/** Fondo claro completo a partir del token. */
export function lightBackgroundFrom(base: string): HourglassTheme['background'] {
  return {
    top: shift(base, LIGHT_OFFSETS.top),
    bottom: shift(base, LIGHT_OFFSETS.bottom),
    glow: shift(base, LIGHT_OFFSETS.glow),
    glowPos: [0.22, 0.16],
    vignette: shift(base, LIGHT_OFFSETS.vignette),
  };
}

export const LIGHT_THEME: HourglassTheme = {
  scheme: 'light',
  background: lightBackgroundFrom(LIGHT_BACKGROUND),
  glass: {
    tint: hex('#CFC5B9'),
    reflection: 1,
    edge: 'rgba(92, 78, 64, 0.38)',
    edgeHighlight: 'rgba(255, 252, 246, 0.75)',
  },
  shadow: {
    color: 'rgba(84, 64, 44, 0.26)',
    contact: 'rgba(70, 52, 36, 0.55)',
    caustic: 'rgba(255, 246, 228, 0.35)',
  },
  sand: { exposure: 1, stream: 'rgba(176, 148, 112, 0.95)' },
  text: {
    time: '#B3A698',
    hint: '#C4B8AB',
    pause: '#7D6E60',
    pauseGlow: 'rgba(250, 246, 240, 0.95)',
  },
  solid: LIGHT_BACKGROUND,
  ui: {
    ink: '#4F443B',
    inkSoft: '#6B5E53',
    label: '#716458',
    track: 'rgba(92, 78, 64, 0.075)',
    pill: 'rgba(255, 252, 247, 0.94)',
    pillShadow: '0px 1px 2px rgba(84, 64, 44, 0.10), 0px 4px 12px rgba(84, 64, 44, 0.07)',
    accent: '#8C7660',
    toggleOff: 'rgba(92, 78, 64, 0.16)',
    knob: '#FFFCF7',
    line: 'rgba(92, 78, 64, 0.11)',
    panelTint: 'rgba(244, 239, 232, 0.70)',
    panelEdge: 'rgba(255, 252, 246, 0.80)',
    scrim: 'rgba(235, 229, 221, 0.20)',
    grabber: 'rgba(92, 78, 64, 0.18)',
    menuIcon: '#8F8272',
  },
};

export const DARK_THEME: HourglassTheme = {
  scheme: 'dark',
  background: {
    top: hex('#2A241F'),
    bottom: hex('#16130F'),
    glow: hex('#463B31'),
    glowPos: [0.24, 0.18],
    vignette: hex('#0C0A08'),
  },
  glass: {
    tint: hex('#8F857A'),
    reflection: 0.55,
    edge: 'rgba(0, 0, 0, 0.45)',
    edgeHighlight: 'rgba(255, 238, 214, 0.30)',
  },
  shadow: {
    color: 'rgba(0, 0, 0, 0.35)',
    contact: 'rgba(0, 0, 0, 0.6)',
    caustic: 'rgba(255, 220, 170, 0.10)',
  },
  sand: { exposure: 0.92, stream: 'rgba(170, 142, 106, 0.95)' },
  text: {
    time: '#544A41',
    hint: '#463E37',
    pause: '#CDBFAD',
    pauseGlow: 'rgba(12, 10, 8, 0.9)',
  },
  solid: '#201B17',
  ui: {
    ink: '#E8DCCB',
    inkSoft: '#B9AB9C',
    label: '#A39586',
    track: 'rgba(255, 238, 214, 0.06)',
    pill: 'rgba(255, 238, 214, 0.14)',
    pillShadow: '0px 1px 2px rgba(0, 0, 0, 0.35)',
    accent: '#B59D80',
    toggleOff: 'rgba(255, 238, 214, 0.14)',
    knob: '#EDE2D3',
    line: 'rgba(255, 238, 214, 0.08)',
    panelTint: 'rgba(30, 25, 21, 0.66)',
    panelEdge: 'rgba(255, 238, 214, 0.10)',
    scrim: 'rgba(12, 10, 8, 0.22)',
    grabber: 'rgba(255, 238, 214, 0.16)',
    menuIcon: '#796C60',
  },
};

export function themeFor(scheme: ColorSchemeName | null | undefined): HourglassTheme {
  return scheme === 'dark' ? DARK_THEME : LIGHT_THEME;
}

/**
 * Esquema efectivo según la preferencia guardada: 'system' (Automático)
 * sigue al sistema; si el sistema no lo dice, claro.
 */
export function resolveScheme(
  preference: 'system' | 'light' | 'dark',
  system: ColorSchemeName | null | undefined | 'unspecified',
): ColorSchemeName {
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

/** Convierte un color 0..255 del catálogo en 0..1. */
export function rgbTo01(c: Rgb): Rgb01 {
  return [c[0] / 255, c[1] / 255, c[2] / 255];
}
