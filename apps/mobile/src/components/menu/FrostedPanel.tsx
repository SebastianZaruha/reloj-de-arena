/**
 * Vidrio esmerilado de la hoja de ajustes, dibujado con SKIA dentro del
 * mismo lienzo que el reloj (se pasa como `children` de <Hourglass>).
 *
 * ¿Por qué aquí y no con un `BlurView` nativo? Porque Skia ya está en la app
 * (sin dependencias nativas nuevas) y porque así el vidrio desenfoca lo que
 * hay detrás en el mismo lienzo: el reloj. La parte de React Native de la
 * hoja (textos y botones) va encima, con fondo transparente, y se mueve con
 * el MISMO shared value (`top`), así que vidrio y contenido nunca se separan.
 *
 * Capas:
 *   1. Velo muy suave sobre toda la pantalla (aparece al abrir).
 *   2. Sombra difusa encima del canto de la hoja.
 *   3. Dentro de la forma de la hoja: la foto desenfocada de la escena
 *      (`scene.backdrop`, la prepara <Hourglass>), el velo y el tinte.
 *   4. Brillo de 1 px en el canto superior (como el canto de un vidrio).
 *
 * Coste (1.8.2): la GPU solo estira una imagen pequeña. Hasta la 1.8 era un
 * BackdropBlur (leer la pantalla ya dibujada, carísimo en los móviles) y en
 * la 1.8.1 una copia desenfocada del reloj, que al abrir obligaba a la GPU a
 * preparar shaders nuevos: la hoja tardaba ~2 s en salir en un Samsung A55.
 * Ver hourglass/frostedBackdrop.ts.
 *
 * Está SIEMPRE montado (1.8.2): con la hoja cerrada todo queda fuera de la
 * pantalla o con opacidad 0, y Skia no dibuja nada. Así abrir no monta nada
 * en el lienzo y el primer fotograma ya sale completo.
 */
import {
  FilterMode,
  Image,
  MipmapMode,
  Fill,
  Group,
  LinearGradient,
  Rect,
  RoundedRect,
  rect,
  rrect,
  vec,
} from '@shopify/react-native-skia';
import { interpolateColor, useDerivedValue, type SharedValue } from 'react-native-reanimated';

import type { HourglassScene } from '../../hourglass';
import { DARK_THEME, LIGHT_THEME } from '../../theme/theme';

/** Radio de las esquinas superiores de la hoja. */
export const SHEET_RADIUS = 30;
/** La foto es pequeña: se estira con filtrado lineal (ya está desenfocada). */
const SMOOTH = { filter: FilterMode.Linear, mipmap: MipmapMode.None } as const;
/** Alto de la sombra sobre el canto. */
const SHADOW_H = 28;

const L = LIGHT_THEME.ui;
const D = DARK_THEME.ui;

interface Props {
  readonly width: number;
  readonly height: number;
  /** Coordenada Y del canto superior de la hoja (se anima). */
  readonly top: SharedValue<number>;
  /** 0 = cerrada, 1 = abierta (para el velo). */
  readonly openness: SharedValue<number>;
  /** 0 = tema claro, 1 = oscuro (animado). */
  readonly themeProgress: SharedValue<number>;
  /** La escena del reloj: su foto desenfocada para detrás del vidrio. */
  readonly scene: HourglassScene;
}

export function FrostedPanel({ width, height, top, openness, themeProgress, scene }: Props) {
  // La forma se prolonga por debajo de la pantalla para que las esquinas
  // redondeadas de abajo nunca se vean.
  const shape = useDerivedValue(() =>
    rrect(rect(0, top.value, width, height - top.value + SHEET_RADIUS), SHEET_RADIUS, SHEET_RADIUS),
  );
  const edgeBand = useDerivedValue(() => rect(0, top.value, width, SHEET_RADIUS));
  const shadowRect = useDerivedValue(() => rect(0, top.value - SHADOW_H, width, SHADOW_H + SHEET_RADIUS));
  const shadowStart = useDerivedValue(() => vec(0, top.value - SHADOW_H));
  const shadowEnd = useDerivedValue(() => vec(0, top.value + 4));

  const tint = useDerivedValue(() =>
    interpolateColor(themeProgress.value, [0, 1], [L.panelTint, D.panelTint]),
  );
  const edge = useDerivedValue(() =>
    interpolateColor(themeProgress.value, [0, 1], [L.panelEdge, D.panelEdge]),
  );
  const scrim = useDerivedValue(() => interpolateColor(themeProgress.value, [0, 1], [L.scrim, D.scrim]));
  const shadowColors = useDerivedValue(() => [
    'rgba(60, 44, 30, 0)',
    interpolateColor(themeProgress.value, [0, 1], ['rgba(60, 44, 30, 0.07)', 'rgba(0, 0, 0, 0.28)']),
  ]);

  return (
    <Group>
      <Rect x={0} y={0} width={width} height={height} color={scrim} opacity={openness} />
      <Rect rect={shadowRect}>
        <LinearGradient start={shadowStart} end={shadowEnd} colors={shadowColors} />
      </Rect>
      <Group clip={shape}>
        <Image
          image={scene.backdrop}
          x={0}
          y={0}
          width={width}
          height={height}
          fit="fill"
          sampling={SMOOTH}
        />
        <Fill color={scrim} opacity={openness} />
        <Fill color={tint} />
      </Group>
      <Group clip={edgeBand}>
        <RoundedRect rect={shape} style="stroke" strokeWidth={1} color={edge} />
      </Group>
    </Group>
  );
}
