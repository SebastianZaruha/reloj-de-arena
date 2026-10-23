/**
 * Vidrio esmerilado de la hoja de ajustes, dibujado con SKIA dentro del
 * mismo lienzo que el reloj (se pasa como `children` de <Hourglass>).
 *
 * ¿Por qué aquí y no con un `BlurView` nativo? Porque Skia ya está en la app
 * (sin dependencias nativas nuevas) y porque un desenfoque de fondo
 * («backdrop») solo puede desenfocar lo que se ha dibujado ANTES en el mismo
 * lienzo: el reloj. La parte de React Native de la hoja (textos y botones)
 * va encima, con fondo transparente, y se mueve con el MISMO shared value
 * (`top`), así que vidrio y contenido nunca se separan.
 *
 * Capas:
 *   1. Velo muy suave sobre toda la pantalla (aparece al abrir).
 *   2. Sombra difusa encima del canto de la hoja.
 *   3. BackdropBlur recortado a la forma de la hoja + tinte del tema.
 *   4. Brillo de 1 px en el canto superior (como el canto de un vidrio).
 *
 * Coste: solo se monta mientras la hoja está abierta o animándose.
 *
 * Historia (1.8.2): este es otra vez el vidrio de la 1.6. En la 1.8.1 se
 * cambió el BackdropBlur por una copia desenfocada del reloj dibujada dentro
 * de la hoja, y en un Samsung A55 la hoja tardaba ~2 s en salir (también
 * nada más abrir la app, con el reloj quieto): esa copia, con los shaders del
 * vidrio dentro de una capa desenfocada, obligaba a la GPU a preparar
 * programas nuevos al abrir. El BackdropBlur iba fluido en la 1.6 en ese
 * mismo móvil; lo que lo hacía ir a tirones en la 1.8 era el resto (la
 * pantalla re-renderizándose 4 veces por segundo, las llamadas nativas y los
 * fotogramas encolados), ya arreglado en la 1.8.1.
 *
 * Diagnóstico (1.8.3): `mode` permite probar en el móvil otras dos formas
 * (ver dev/diagnostics.ts): el mismo BackdropBlur montado desde el arranque
 * (`premounted`) o un panel sin desenfoque, del color del tema (`flat`).
 */
import {
  BackdropBlur,
  Fill,
  Group,
  LinearGradient,
  Rect,
  RoundedRect,
  rect,
  rrect,
  vec,
} from '@shopify/react-native-skia';
import { useLayoutEffect } from 'react';
import { interpolateColor, useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { mark, type GlassMode } from '../../dev/diagnostics';

import { DARK_THEME, LIGHT_THEME } from '../../theme/theme';

/** Radio de las esquinas superiores de la hoja. */
export const SHEET_RADIUS = 30;
/** Desenfoque del vidrio (px). */
const BLUR = 26;
/** Panel sin desenfoque (diagnóstico `flat`): el tinte, casi opaco, arriba y abajo. */
const FLAT_LIGHT = ['rgba(247, 243, 237, 0.94)', 'rgba(238, 232, 224, 0.96)'] as const;
const FLAT_DARK = ['rgba(44, 37, 31, 0.93)', 'rgba(32, 27, 23, 0.96)'] as const;
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
  /** Forma de dibujar el vidrio (diagnóstico; por defecto, `live`). */
  readonly mode?: GlassMode;
}

export function FrostedPanel({ width, height, top, openness, themeProgress, mode = 'live' }: Props) {
  // Diagnóstico: el vidrio ya está en el lienzo (montado al abrir).
  useLayoutEffect(() => {
    if (mode === 'live') mark('panel');
  }, [mode]);
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
  const flatStart = useDerivedValue(() => vec(0, top.value));
  const flatEnd = useDerivedValue(() => vec(0, height));
  const flatColors = useDerivedValue(() => [
    interpolateColor(themeProgress.value, [0, 1], [FLAT_LIGHT[0], FLAT_DARK[0]]),
    interpolateColor(themeProgress.value, [0, 1], [FLAT_LIGHT[1], FLAT_DARK[1]]),
  ]);
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
      {mode === 'flat' ? (
        <Group clip={shape}>
          <Fill>
            <LinearGradient start={flatStart} end={flatEnd} colors={flatColors} />
          </Fill>
        </Group>
      ) : (
        <BackdropBlur blur={BLUR} clip={shape}>
          <Fill color={tint} />
        </BackdropBlur>
      )}
      <Group clip={edgeBand}>
        <RoundedRect rect={shape} style="stroke" strokeWidth={1} color={edge} />
      </Group>
    </Group>
  );
}
