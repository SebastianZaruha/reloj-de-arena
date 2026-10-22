/**
 * <Hourglass />: el reloj de arena completo dibujado con Skia.
 *
 * Es un componente REUTILIZABLE: no sabe de gestos, ajustes ni pantallas.
 * Recibe el tamaño, el tema, el estado del temporizador y una fuente de
 * movimiento (gravedad e inclinación, en vivo). Por eso podrá usarse tal cual
 * en la versión de escritorio (Skia funciona en web con CanvasKit).
 *
 * Capas (de atrás hacia delante), las tres SkPictures en shared values:
 *   1. Fondo + sombra + cuerpo del vidrio   (se regraba si cambia la luz)
 *   2. Arena + chorro                        (dinámica, cada fotograma)
 *   3. Reflejos y contorno del vidrio        (se regraba si cambia la luz)
 *
 * Todo va dentro de un grupo que gira 180° cuando el reloj está volteado y
 * que se desenfoca (`blurred`) en la pausa por tumbar el móvil.
 *
 * Gestión de memoria: TODOS los objetos Skia (shaders compilados, paths,
 * pictures, paints del pintor) pertenecen a esta instancia. Cuando se
 * sustituyen (cambio de tamaño/tema) o el componente se desmonta, se liberan
 * con un pequeño retraso (ver disposal.ts). Nada vive a nivel de módulo.
 */
import {
  SandSimulation,
  type ContentDefinition,
  type HourglassModel,
  type TimerSnapshot,
  type TimerStatus,
} from '@reloj/core';
import { Blur, Canvas, Group, Paint, Picture } from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import type { HourglassTheme } from '../theme/theme';
import { disposeLater } from './disposal';
import { computeLayout, isUsableSize, type LayoutInsets } from './layout';
import { createShaderSet, shaderSetDisposables } from './resources';
import { SandPainter, buildPaletteLut } from './sandPainter';
import { GlassPainter } from './staticLayers';
import { STILL_MOTION, type MotionSource } from './types';
import { useSandEngine } from './useSandEngine';

/** Desenfoque (px) del reloj en la pausa por tumbar el móvil. */
const PAUSE_BLUR = 9;

export interface HourglassProps {
  readonly width: number;
  readonly height: number;
  /** Espacio reservado arriba y abajo (barra de estado, texto del tiempo...). */
  readonly insets: LayoutInsets;
  readonly model: HourglassModel;
  readonly content: ContentDefinition;
  readonly theme: HourglassTheme;
  readonly getSnapshot: () => TimerSnapshot;
  readonly status: TimerStatus;
  readonly durationMs: number;
  /** Gravedad e inclinación en vivo (acelerómetro). Por defecto, quieto y de pie. */
  readonly motion?: MotionSource;
  /** Desenfocar el reloj (pausa por tumbar el móvil). */
  readonly blurred?: boolean;
  readonly reduceMotion?: boolean;
}

function HourglassComponent(props: HourglassProps) {
  // Con un tamaño inválido (0, NaN...) no hay nada que dibujar: así nunca
  // llegan a Skia coordenadas imposibles (p. ej. durante un redimensionado).
  if (!isUsableSize(props.width, props.height)) {
    return <View style={{ width: Math.max(0, props.width || 0), height: Math.max(0, props.height || 0) }} />;
  }
  return <HourglassCanvas {...props} />;
}

function HourglassCanvas({
  width,
  height,
  insets,
  model,
  content,
  theme,
  getSnapshot,
  status,
  durationMs,
  motion = STILL_MOTION,
  blurred = false,
  reduceMotion = false,
}: HourglassProps) {
  // Si el bucle de dibujo falla (fuera del render), lo relanzamos DENTRO del
  // render para que lo capture el error boundary que nos envuelve.
  const [loopError, setLoopError] = useState<unknown>(null);
  if (loopError !== null) throw loopError;
  const onError = useCallback((error: unknown) => setLoopError(() => error), []);

  // Shaders compilados: uno por instancia, liberados al desmontar.
  const shaders = useMemo(() => createShaderSet(), []);
  useEffect(() => () => disposeLater(shaderSetDisposables(shaders)), [shaders]);

  const layout = useMemo(() => computeLayout(width, height, model, insets), [width, height, model, insets]);
  useEffect(() => () => disposeLater([layout.outerPath, layout.innerPath]), [layout]);

  const sim = useMemo(
    () =>
      new SandSimulation({
        profile: model.profile,
        cols: layout.cols,
        slideChance: content.slideChance,
        fillRatio: content.fillRatio,
        seed: 7,
      }),
    [model, layout.cols, content],
  );

  const painter = useMemo(() => {
    const palette = theme.scheme === 'dark' ? content.palette.dark : content.palette.light;
    return new SandPainter(layout, model, theme, buildPaletteLut(palette), shaders);
  }, [layout, model, theme, content, shaders]);
  useEffect(() => () => disposeLater([painter]), [painter]);

  // Pintor del vidrio (fondo, sombra, reflejos): objetos persistentes.
  const glass = useMemo(
    () => new GlassPainter(shaders, layout, model, theme),
    [shaders, layout, model, theme],
  );
  useEffect(() => () => disposeLater([glass]), [glass]);

  const { sand, back, front, rotation } = useSandEngine({
    sim,
    painter,
    glass,
    motion,
    getSnapshot,
    status,
    durationMs,
    reduceMotion,
    onError,
  });

  // Giro de 180° al voltear, alrededor del centro de la pantalla.
  const transform = useDerivedValue(() => [{ rotate: rotation.value }]);
  const origin = useMemo(() => ({ x: width / 2, y: height / 2 }), [width, height]);

  // Desenfoque suave al entrar en la pausa (con "reducir movimiento", directo).
  const blur = useSharedValue(0);
  useEffect(() => {
    blur.value = blurred ? (reduceMotion ? PAUSE_BLUR : withTiming(PAUSE_BLUR, { duration: 320 })) : 0;
  }, [blurred, reduceMotion, blur]);

  // El filtro de desenfoque solo existe mientras hace falta (cuesta GPU).
  const layer = blurred ? (
    <Paint>
      <Blur blur={blur} mode="clamp" />
    </Paint>
  ) : undefined;

  return (
    <Canvas style={{ width, height }}>
      <Group transform={transform} origin={origin} layer={layer}>
        <Picture picture={back} />
        <Picture picture={sand} />
        <Picture picture={front} />
      </Group>
    </Canvas>
  );
}

export const Hourglass = memo(HourglassComponent);
