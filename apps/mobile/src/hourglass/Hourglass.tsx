/**
 * <Hourglass />: el reloj de arena completo dibujado con Skia.
 *
 * Es un componente REUTILIZABLE: no sabe de gestos, ajustes ni pantallas.
 * Recibe el tamaño, el tema, el estado del temporizador y una fuente de
 * movimiento (gravedad e inclinación, en vivo). Por eso podrá usarse tal cual
 * en la versión de escritorio (Skia funciona en web con CanvasKit).
 *
 * Capas (de atrás hacia delante), SkPictures en shared values:
 *   1. Fondo                                 (se regraba si cambia la luz)
 *   2. Sombra sobre la mesa                  (ídem; se desvanece al «levantar» el reloj)
 *   3. Cuerpo del vidrio                     (ídem)
 *   4. Arena + chorro                        (dinámica, cada fotograma)
 *   5. Reflejos y contorno del vidrio        (se regraba si cambia la luz)
 *
 * Grupos (1.5):
 *   [giro 180° del móvil volteado]
 *     fondo
 *     [desenfoque de la pausa, solo en la franja del reloj (1.8.1)]
 *       sombra · [EL RELOJ: cuerpo + arena + reflejos]
 *     `children` (p. ej. el vidrio esmerilado del menú)
 *   [fundido del cambio de tema]
 *
 * EL RELOJ (capas 3-5) tiene su propia transformación, alrededor de su
 * centro: la `pose` (introducción: giro, escala, posición y opacidad) más el
 * giro de cambio de fase (`spin`, lo anima useSandEngine). Mientras gira se
 * «levanta» un poco (se encoge un 5 %) y su sombra se desvanece.
 *
 * Gestión de memoria: TODOS los objetos Skia (shaders compilados, paths,
 * pictures, paints del pintor) pertenecen a esta instancia. Cuando se
 * sustituyen (cambio de tamaño/tema) o el componente se desmonta, se liberan
 * con un pequeño retraso (ver disposal.ts). Nada vive a nivel de módulo.
 */
import { SandSimulation, type ContentDefinition, type HourglassModel, type TimerStatus } from '@reloj/core';
import {
  Blur,
  Canvas,
  Group,
  Image,
  Paint,
  Picture,
  rect,
  useCanvasRef,
  type SkImage,
} from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { HourglassTheme } from '../theme/theme';
import { disposeLater } from './disposal';
import { useFrostedBackdrop } from './frostedBackdrop';
import { computeLayout, isUsableSize, type LayoutInsets } from './layout';
import { createShaderSet, shaderSetDisposables } from './resources';
import { SandPainter, buildPaletteLut } from './sandPainter';
import { GlassPainter } from './staticLayers';
import { STILL_MOTION, type HourglassSnapshot, type MotionSource } from './types';
import { useSandEngine } from './useSandEngine';
import { useThemeCrossfade } from './useThemeCrossfade';

/**
 * Pose del reloj (la usa la introducción). Todos son shared values para
 * animarlos en el hilo de UI sin re-renderizar React.
 */
export interface HourglassPose {
  /** Giro en radianes. */
  readonly rotate: SharedValue<number>;
  /** Escala (1 = tamaño normal). */
  readonly scale: SharedValue<number>;
  /** 0 = en su sitio; 1 = centrado en la pantalla. */
  readonly centered: SharedValue<number>;
  /** Opacidad del reloj. */
  readonly opacity: SharedValue<number>;
  /** Opacidad de la sombra (0 = reloj «en el aire»). */
  readonly shadow: SharedValue<number>;
}

/**
 * Desenfoque del reloj en pausa:
 *  - 'full' (9 px): pausa por tumbar el móvil; el reloj «se aparta».
 *  - 'soft' (2,5 px): pausa con el dedo; se nota la pausa pero el reloj y su
 *    arena se siguen viendo bien (la persona puede querer mirar cuánto queda).
 */
export type PauseBlur = 'none' | 'soft' | 'full';
const PAUSE_BLUR_PX: Record<PauseBlur, number> = { none: 0, soft: 2.5, full: 9 };
/** Margen alrededor del reloj para que el desenfoque más fuerte no se corte (≈ 4σ). */
const BLUR_MARGIN = 40;

export interface HourglassProps {
  readonly width: number;
  readonly height: number;
  /** Espacio reservado arriba y abajo (barra de estado, texto del tiempo...). */
  readonly insets: LayoutInsets;
  readonly model: HourglassModel;
  readonly content: ContentDefinition;
  readonly theme: HourglassTheme;
  readonly getSnapshot: () => HourglassSnapshot;
  readonly status: TimerStatus;
  readonly durationMs: number;
  /** Gravedad e inclinación en vivo (acelerómetro). Por defecto, quieto y de pie. */
  readonly motion?: MotionSource;
  /** Desenfoque de pausa (ver `PauseBlur`). */
  readonly pauseBlur?: PauseBlur;
  readonly reduceMotion?: boolean;
  /** Pose animada del reloj (introducción). Sin ella, quieto en su sitio. */
  readonly pose?: HourglassPose;
  /** true mientras la pose se está animando (activa las capas de opacidad). */
  readonly poseActive?: boolean;
  /**
   * Elementos Skia que se dibujan encima del reloj, en el mismo lienzo (el
   * vidrio esmerilado del menú). Giran con el móvil volteado, pero no se
   * desenfocan en la pausa. Si es una función, recibe la escena
   * (`HourglassScene`): la foto desenfocada para el vidrio.
   */
  readonly children?: ReactNode | ((scene: HourglassScene) => ReactNode);
  /** ¿Se ve el vidrio del menú? Mientras tanto se renueva su foto (1.8.2). */
  readonly backdropActive?: boolean;
}

/**
 * Lo que el reloj ofrece a sus hijos (1.8.2): una foto pequeña y ya
 * desenfocada del fondo y el reloj (ver frostedBackdrop.ts), para pintar el
 * vidrio del menú sin desenfocar nada en la GPU.
 */
export interface HourglassScene {
  readonly backdrop: SharedValue<SkImage | null>;
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
  pauseBlur = 'none',
  reduceMotion = false,
  pose,
  poseActive = false,
  children,
  backdropActive = false,
}: HourglassProps) {
  // Si el bucle de dibujo falla (fuera del render), lo relanzamos DENTRO del
  // render para que lo capture el error boundary que nos envuelve.
  const [loopError, setLoopError] = useState<unknown>(null);
  if (loopError !== null) throw loopError;
  const onError = useCallback((error: unknown) => setLoopError(() => error), []);
  // ¿Está dando la vuelta por un cambio de fase? (lo avisa el bucle de dibujo)
  const [turning, setTurning] = useState(false);

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

  const { background, shadow, body, sand, front, rotation, spin } = useSandEngine({
    sim,
    painter,
    glass,
    motion,
    getSnapshot,
    status,
    durationMs,
    reduceMotion,
    onError,
    onTurnChange: setTurning,
  });

  // Giro de 180° al voltear, alrededor del centro de la pantalla.
  const transform = useDerivedValue(() => [{ rotate: rotation.value }]);
  const origin = useMemo(() => ({ x: width / 2, y: height / 2 }), [width, height]);

  // Transformación del RELOJ alrededor de su propio centro (el cuello).
  const center = useMemo(() => ({ x: layout.cx, y: layout.cy }), [layout]);
  /** Distancia del centro del reloj al de la pantalla (la intro empieza centrada). */
  const toScreenCenter = height / 2 - layout.cy;
  const objW = 2 * layout.halfW;
  const objH = 2 * layout.halfH;
  /** Ancho útil para el reloj cuando gira (deja un margen a los lados). */
  const roomW = width * 0.94;
  const objectTransform = useDerivedValue(() => {
    const angle = (pose ? pose.rotate.value : 0) + spin.value;
    // Un reloj alto, al girar, se pone horizontal y no cabría a lo ancho:
    // lo encogemos lo justo para que su silueta girada quepa siempre. Es
    // una función continua del ángulo, así que se ve como un «respirar» suave.
    const s = Math.abs(Math.sin(angle));
    const c = Math.abs(Math.cos(angle));
    const fit = Math.min(1, roomW / (objH * s + objW * c));
    // `lift`: 0 en reposo, 1 a mitad del giro de cambio de fase (se «levanta»).
    const lift = Math.abs(Math.sin(spin.value));
    const scale = (pose ? pose.scale.value : 1) * fit * (1 - 0.04 * lift);
    const dy = (pose ? pose.centered.value : 0) * toScreenCenter;
    return [{ translateY: dy }, { scale }, { rotate: angle }];
  });
  const objectOpacity = useDerivedValue(() => (pose ? pose.opacity.value : 1));
  const shadowOpacity = useDerivedValue(
    () => (pose ? pose.shadow.value : 1) * (1 - 0.9 * Math.abs(Math.sin(spin.value))),
  );
  // Un <Picture> no hereda la opacidad de su grupo: para desvanecerlo hace
  // falta una capa (saveLayer). Las capas cuestan, así que SOLO existen
  // mientras se anima: introducción (`poseActive`) o giro de fase (`turning`).
  const objectLayer = poseActive ? <Paint opacity={objectOpacity} /> : undefined;
  const shadowLayer = poseActive || turning ? <Paint opacity={shadowOpacity} /> : undefined;

  // Desenfoque suave al entrar Y al salir de la pausa (con «reducir
  // movimiento», directo). El filtro solo existe mientras hace falta (cuesta
  // GPU): se crea al pausar y se quita cuando el desenfoque ha vuelto a 0.
  const blur = useSharedValue(0);
  const target = PAUSE_BLUR_PX[pauseBlur];
  const [blurLayerOn, setBlurLayerOn] = useState(target > 0);
  // Patrón «estado derivado» de React (ajuste durante el render).
  if (target > 0 && !blurLayerOn) setBlurLayerOn(true);
  if (target === 0 && reduceMotion && blurLayerOn) setBlurLayerOn(false);
  useEffect(() => {
    if (reduceMotion) {
      blur.set(target);
      return;
    }
    const off = () => setBlurLayerOn(false);
    blur.set(
      withTiming(target, { duration: target > 0 ? 320 : 240 }, (finished) => {
        'worklet';
        if (finished && target === 0) scheduleOnRN(off);
      }),
    );
  }, [target, reduceMotion, blur]);

  // El desenfoque solo cubre la franja del reloj y su sombra (1.8.1). El fondo
  // es un degradado muy suave: desenfocado se ve igual, pero desenfocar toda
  // la pantalla en cada fotograma costaba unas tres veces más en la GPU.
  // Durante la introducción el reloj se mueve por la pantalla: sin recorte.
  const blurClip = useMemo(() => {
    const top = Math.max(0, layout.cy - layout.halfH - BLUR_MARGIN);
    const bottom = Math.min(height, layout.cy + layout.halfH + BLUR_MARGIN + 0.3 * layout.halfH);
    return rect(0, top, width, Math.max(0, bottom - top));
  }, [layout, width, height]);

  const layer = blurLayerOn ? (
    <Paint>
      <Blur blur={blur} mode="clamp" />
    </Paint>
  ) : undefined;

  // Fundido al cambiar de tema: foto del lienzo antiguo que se desvanece.
  const canvasRef = useCanvasRef();
  const fade = useThemeCrossfade(canvasRef, theme, reduceMotion);

  // Foto desenfocada para el vidrio del menú (1.8.2). La pose es la del reloj
  // en reposo, con el giro del cambio de fase (la intro no coincide con el menú).
  const backdrop = useFrostedBackdrop({
    width,
    height,
    active: backdropActive,
    moving: status === 'running',
    version: glass,
    read: () => {
      const angle = spin.get();
      const s = Math.abs(Math.sin(angle));
      const c = Math.abs(Math.cos(angle));
      const fit = Math.min(1, roomW / (objH * s + objW * c));
      const lift = Math.abs(Math.sin(angle));
      return {
        background: background.get(),
        shadow: shadow.get(),
        body: body.get(),
        sand: sand.get(),
        front: front.get(),
        cx: layout.cx,
        cy: layout.cy,
        scale: fit * (1 - 0.04 * lift),
        angle,
      };
    },
  });
  const scene = useMemo(() => ({ backdrop }), [backdrop]);
  const extra = typeof children === 'function' ? children(scene) : children;

  return (
    <Canvas ref={canvasRef} style={{ width, height }}>
      <Group transform={transform} origin={origin}>
        <Picture picture={background} />
        <Group layer={layer} clip={blurLayerOn && !poseActive ? blurClip : undefined}>
          <Group layer={shadowLayer}>
            <Picture picture={shadow} />
          </Group>
          <Group transform={objectTransform} origin={center} layer={objectLayer}>
            <Picture picture={body} />
            <Picture picture={sand} />
            <Picture picture={front} />
          </Group>
        </Group>
        {extra}
      </Group>
      {fade.image ? (
        <Image
          image={fade.image}
          x={0}
          y={0}
          width={width}
          height={height}
          fit="fill"
          opacity={fade.opacity}
        />
      ) : null}
    </Canvas>
  );
}

export const Hourglass = memo(HourglassComponent);
