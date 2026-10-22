/**
 * Bucle de animación del reloj.
 *
 * En cada fotograma (requestAnimationFrame, ~60 por segundo):
 *  0. Si se ha volteado el móvil, la arena da la vuelta (rotateHalfTurn) y el
 *     dibujo gira 180° en el MISMO fotograma (para que no se vea un salto).
 *  1. Pregunta al temporizador cuánto tiempo queda (calculado a partir de
 *     marcas de tiempo, así que siempre es exacto).
 *  2. El controlador de flujo pasa por el cuello los granos necesarios.
 *  3. La simulación avanza dos pasos con la gravedad del acelerómetro (los
 *     granos ruedan, se deslizan en avalanchas y se asientan) y las
 *     partículas del chorro se mueven (el chorro se curva con la inclinación).
 *  4. Si algo ha cambiado, se pinta un nuevo SkPicture de arena; si ha
 *     cambiado la inclinación, también se regraban las capas del vidrio (la
 *     luz, los reflejos y la sombra se mueven). Todo se publica en "shared
 *     values" de Reanimated: el Canvas lo dibuja en el hilo de UI sin volver
 *     a renderizar componentes de React.
 *
 * Cuando la arena está quieta, el temporizador no corre y el móvil no se
 * mueve, el bucle se DETIENE (cero consumo de batería) hasta que algo lo
 * despierta (un cambio de props o un aviso de la fuente de movimiento).
 *
 * Memoria: el bucle no crea objetos JS por fotograma (todo se reutiliza) y
 * cada SkPicture sustituido se libera unos fotogramas después, en un anillo
 * de tamaño fijo (PictureSlot). Si algo falla dentro del bucle (fuera del
 * render de React, así que un error boundary no lo vería), paramos el bucle
 * y avisamos con `onError`.
 */
import {
  MAX_DURATION_MS,
  MIN_DURATION_MS,
  MIN_FLOW_GRAVITY_Y,
  sandLevelForDuration,
  StreamParticles,
  syncSandToTarget,
  targetSourceGrains,
  type SandSimulation,
  type StreamInput,
  type TimerSnapshot,
  type TimerStatus,
} from '@reloj/core';
import type { SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { useLatest } from '../hooks/useLatest';
import { PictureSlot, recordEmptyPicture } from './pictureSlot';
import type { SandPainter, StreamState } from './sandPainter';
import type { GlassPainter } from './staticLayers';
import type { MotionSource } from './types';

export interface SandEngineParams {
  readonly sim: SandSimulation;
  readonly painter: SandPainter;
  readonly glass: GlassPainter;
  readonly motion: MotionSource;
  /** Devuelve la foto actual del temporizador. */
  readonly getSnapshot: () => TimerSnapshot;
  readonly status: TimerStatus;
  readonly durationMs: number;
  readonly reduceMotion: boolean;
  /** Se llama si el dibujo falla (para que un error boundary lo recupere). */
  readonly onError: (error: unknown) => void;
}

export interface SandEngineOutput {
  readonly sand: SharedValue<SkPicture>;
  readonly back: SharedValue<SkPicture>;
  readonly front: SharedValue<SkPicture>;
  /** Giro del dibujo (radianes): 0 de pie, π volteado. */
  readonly rotation: SharedValue<number>;
}

/** Pasos de simulación por fotograma (más = arena más "viva", más CPU). */
const STEPS_PER_FRAME = 2;
/** Cambio mínimo de inclinación para regrabar las capas del vidrio (más pequeño no se ve). */
const LIGHT_EPSILON = 0.01;

export function useSandEngine(params: SandEngineParams): SandEngineOutput {
  const { sim, status, durationMs, motion } = params;
  const [emptyPicture] = useState(recordEmptyPicture);
  // Granos sueltos del chorro: capacidad fija, se crean una sola vez.
  const [particles] = useState(() => new StreamParticles({ capacity: 360, seed: 7 }));
  const sand = useSharedValue<SkPicture>(emptyPicture);
  const back = useSharedValue<SkPicture>(emptyPicture);
  const front = useSharedValue<SkPicture>(emptyPicture);
  const rotation = useSharedValue(motion.flipped ? Math.PI : 0);
  const slots = useMemo(
    () => ({
      sand: new PictureSlot(sand, emptyPicture),
      back: new PictureSlot(back, emptyPicture),
      front: new PictureSlot(front, emptyPicture),
    }),
    [sand, back, front, emptyPicture],
  );

  // Guardamos los parámetros más recientes en una ref para que el bucle
  // (que vive fuera del ciclo de render de React) siempre lea valores frescos.
  const live = useLatest(params);

  /** Granos que había arriba al empezar con esta duración. */
  const initialGrains = useMemo(
    () => Math.round(sim.totalGrains * sandLevelForDuration(durationMs)),
    [sim, durationMs],
  );
  const initialRef = useLatest(initialGrains);

  const loop = useRef({
    raf: null as number | null,
    dirty: true,
    failed: false,
    /** Simulación ya rellenada de arena (para detectar simulaciones nuevas). */
    populated: null as SandSimulation | null,
    /**
     * Granos del bulbo de arriba al empezar ESTA tanda. Normalmente los que
     * corresponden a la duración; tras voltear, los que había abajo.
     */
    runInitial: 0,
    /** Volteos ya aplicados a la arena. */
    flips: motion.flips,
    streamShown: false,
    /** Capas del vidrio: con qué pintor e inclinación se grabaron. */
    glass: null as GlassPainter | null,
    lightX: Number.NaN,
    lightY: Number.NaN,
    /** Estado del chorro reutilizado en cada fotograma (sin crear objetos). */
    stream: { flowing: false, particles: null, reduceMotion: false } as StreamState,
    /** Entrada de las partículas, reutilizada en cada fotograma. */
    particleInput: {
      dt: 0,
      emitting: false,
      intensity: 1,
      gravity: { x: 0, y: 1 },
      calm: false,
    } as StreamInput,
    /** Marca de tiempo del fotograma anterior (para calcular dt). */
    lastTime: 0,
  });

  // La función que despierta el bucle (estable entre renders).
  const wake = useCallback(() => {
    const state = loop.current;
    state.dirty = true;
    if (state.raf !== null || state.failed) return;

    const frame = () => {
      state.raf = null;
      try {
        runFrame();
      } catch (error) {
        // No reintentamos en bucle: paramos y dejamos que el error boundary
        // remonte el lienzo (el temporizador no se entera: va por timestamps).
        state.failed = true;
        live.current.onError(error);
      }
    };

    const runFrame = () => {
      const p = live.current;
      const m = p.motion;
      const g = m.gravity; // suave: chorro y dibujo
      const gs = m.simGravity; // en escalones: simulación
      const snap = p.getSnapshot();

      let changed = state.dirty;
      state.dirty = false;

      // 0) Volteo: la arena da la vuelta y el dibujo gira 180° a la vez.
      if (m.flips !== state.flips) {
        state.flips = m.flips;
        if (state.populated === p.sim) {
          p.sim.rotateHalfTurn();
          // La nueva tanda vacía TODO lo que ahora está arriba.
          state.runInitial = p.sim.topCount;
        }
        particles.reset(7);
        rotation.value = m.flipped ? Math.PI : 0;
        changed = true;
      }

      // 1-2) Sincronizar la arena con el tiempo restante.
      if (state.populated !== p.sim) {
        // Simulación nueva (cambio de tamaño, Fast Refresh, remontaje tras
        // un error...): la rellenamos según el tiempo restante AHORA. Antes
        // de esto, una simulación recreada con el tiempo corriendo se quedaba
        // vacía y la arena "desaparecía" hasta el siguiente gesto.
        state.runInitial = initialRef.current;
        const top =
          snap.status === 'idle'
            ? state.runInitial
            : targetSourceGrains(state.runInitial, snap.remainingMs, snap.durationMs);
        p.sim.arrange(top, p.sim.totalGrains - top, gs, { crater: snap.status === 'idle' ? 0 : 0.35 });
        state.populated = p.sim;
        particles.reset(7);
        changed = true;
      }
      if (snap.status !== 'idle') {
        const target = targetSourceGrains(state.runInitial, snap.remainingMs, snap.durationMs);
        if (syncSandToTarget(p.sim, target, gs, { maxPerFrame: 8 }) !== 'idle') changed = true;
      }

      // 3) Física.
      for (let i = 0; i < STEPS_PER_FRAME; i++) {
        if (p.sim.step(gs) > 0) changed = true;
      }

      // 3b) Granos sueltos del chorro. Siguen cayendo aunque el flujo se
      //     corte: así el chorro termina con los últimos granos.
      const streaming =
        snap.status === 'running' &&
        snap.remainingMs > 0 &&
        gs.y >= MIN_FLOW_GRAVITY_Y &&
        p.sim.hasGrainAtNeck(gs);
      const now = performance.now();
      const pin = state.particleInput;
      pin.dt = state.lastTime > 0 ? (now - state.lastTime) / 1000 : 1 / 60;
      state.lastTime = now;
      pin.emitting = streaming;
      pin.intensity = streamIntensity(snap.durationMs);
      pin.gravity = g;
      pin.calm = p.reduceMotion;
      particles.update(p.sim, pin);

      // 4a) Vidrio: regrabamos si cambió el pintor (tamaño/tema) o la luz.
      const t = m.tilt;
      if (
        state.glass !== p.glass ||
        Math.abs(t.x - state.lightX) > LIGHT_EPSILON ||
        Math.abs(t.y - state.lightY) > LIGHT_EPSILON
      ) {
        slots.back.publish(p.glass.recordBack(t));
        slots.front.publish(p.glass.recordFront(t));
        state.glass = p.glass;
        state.lightX = t.x;
        state.lightY = t.y;
        changed = true; // la luz de la arena también se mueve
      }

      // 4b) Arena.
      if (changed || particles.active || streaming !== state.streamShown) {
        const stream = state.stream;
        stream.flowing = streaming;
        stream.particles = particles;
        stream.reduceMotion = p.reduceMotion;
        slots.sand.publish(p.painter.paint(p.sim, m, stream));
        state.streamShown = streaming;
      }

      // ¿Seguimos? Mientras corre el tiempo o la arena se mueve, sí.
      const keepGoing = snap.status === 'running' || !p.sim.isSettled || state.dirty || particles.active;
      if (keepGoing) state.raf = requestAnimationFrame(frame);
      else state.lastTime = 0;
    };
    state.raf = requestAnimationFrame(frame);
  }, [live, initialRef, particles, rotation, slots]);

  // Al elegir duración (o reiniciar), colocamos la arena directamente.
  useEffect(() => {
    if (status !== 'idle') return;
    const state = loop.current;
    sim.arrange(initialGrains, sim.totalGrains - initialGrains, live.current.motion.simGravity, {
      crater: 0,
    });
    state.populated = sim;
    state.runInitial = initialGrains;
    wake();
  }, [sim, status, initialGrains, wake, live]);

  // Cualquier cambio relevante despierta el bucle.
  useEffect(() => {
    wake();
  }, [status, params.painter, params.glass, params.reduceMotion, wake]);

  // La fuente de movimiento (acelerómetro) también lo despierta.
  useEffect(() => motion.subscribe(wake), [motion, wake]);

  // Al desmontar, paramos el bucle y liberamos (con margen) los pictures.
  // Los shared values vuelven al picture vacío por si React vuelve a montar
  // el mismo componente (StrictMode, Fast Refresh): así nunca apuntan a un
  // objeto liberado. El picture vacío (unos bytes) no se libera por eso.
  useEffect(() => {
    const state = loop.current;
    state.failed = false;
    return () => {
      if (state.raf !== null) cancelAnimationFrame(state.raf);
      state.raf = null;
      state.dirty = true;
      state.glass = null;
      slots.sand.release();
      slots.back.release();
      slots.front.release();
    };
  }, [slots]);

  return { sand, back, front, rotation };
}

/** Grosor relativo del chorro: más fino cuanto más largo es el temporizador. */
function streamIntensity(durationMs: number): number {
  const t = Math.log(durationMs / MIN_DURATION_MS) / Math.log(MAX_DURATION_MS / MIN_DURATION_MS);
  return 1 - 0.6 * Math.min(1, Math.max(0, t));
}
