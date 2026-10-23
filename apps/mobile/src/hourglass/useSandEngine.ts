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
 * Cambio de fase (ciclos, 1.5): cuando `transitions` sube en la foto del
 * temporizador, el reloj se DA LA VUELTA con una animación (`spin`: 0 → π en
 * TURN_MS, lento-rápido-lento). La arena no se toca durante el giro (va
 * «pegada» al vidrio, como en uno de verdad); al terminar, en el MISMO
 * fotograma, la rejilla gira 180° (rotateHalfTurn) y `spin` vuelve a 0: el
 * dibujo es idéntico, pero ahora la arena está arriba y empieza a caer. Lo
 * llevamos aquí (en el hilo de JS) y no con withTiming para que el giro y el
 * cambio de la rejilla nunca se desincronicen ni un fotograma.
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
  flowBudget,
  MIN_FLOW_GRAVITY_Y,
  sandLevelForDuration,
  StreamParticles,
  syncSandToTarget,
  targetSourceGrains,
  type SandSimulation,
  type StreamInput,
  type TimerStatus,
} from '@reloj/core';
import type { SkPicture } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { useLatest } from '../hooks/useLatest';
import { PictureSlot, recordEmptyPicture } from './pictureSlot';
import type { SandPainter, StreamState } from './sandPainter';
import type { GlassPainter } from './staticLayers';
import type { HourglassSnapshot, MotionSource } from './types';

export interface SandEngineParams {
  readonly sim: SandSimulation;
  readonly painter: SandPainter;
  readonly glass: GlassPainter;
  readonly motion: MotionSource;
  /** Devuelve la foto actual del temporizador. */
  readonly getSnapshot: () => HourglassSnapshot;
  readonly status: TimerStatus;
  readonly durationMs: number;
  readonly reduceMotion: boolean;
  /** Se llama si el dibujo falla (para que un error boundary lo recupere). */
  readonly onError: (error: unknown) => void;
  /** Avisa al empezar (true) y al acabar (false) el giro de cambio de fase. */
  readonly onTurnChange?: (turning: boolean) => void;
}

export interface SandEngineOutput {
  readonly background: SharedValue<SkPicture>;
  readonly shadow: SharedValue<SkPicture>;
  readonly body: SharedValue<SkPicture>;
  readonly sand: SharedValue<SkPicture>;
  readonly front: SharedValue<SkPicture>;
  /** Giro de TODO el dibujo (radianes): 0 de pie, π con el móvil volteado. */
  readonly rotation: SharedValue<number>;
  /** Giro del reloj (sin el fondo) en un cambio de fase: 0 → π. */
  readonly spin: SharedValue<number>;
}

/** Duración del giro en un cambio de fase (ms). */
export const TURN_MS = 950;

/** Pasos de simulación por fotograma (más = arena más "viva", más CPU). */
const STEPS_PER_FRAME = 2;
/**
 * Fotogramas largos (el navegador a 20–30 fps): la arena da los pasos que
 * le tocarían a 60 fps, hasta este máximo de «fotogramas de 60» por
 * fotograma. Sin esto, a pocos fps la arena caía más despacio que el
 * tiempo, se acumulaba retraso y salía a tirones. A 60 fps: 1 (como siempre).
 */
const MAX_CATCH_UP = 3;
/** Cambio mínimo de inclinación para regrabar las capas del vidrio (más pequeño no se ve). */
const LIGHT_EPSILON = 0.01;

export function useSandEngine(params: SandEngineParams): SandEngineOutput {
  const { sim, status, durationMs, motion } = params;
  const [emptyPicture] = useState(recordEmptyPicture);
  // Granos sueltos del chorro: capacidad fija, se crean una sola vez.
  const [particles] = useState(() => new StreamParticles({ capacity: 360, seed: 7 }));
  const background = useSharedValue<SkPicture>(emptyPicture);
  const shadow = useSharedValue<SkPicture>(emptyPicture);
  const body = useSharedValue<SkPicture>(emptyPicture);
  const sand = useSharedValue<SkPicture>(emptyPicture);
  const front = useSharedValue<SkPicture>(emptyPicture);
  const rotation = useSharedValue(motion.flipped ? Math.PI : 0);
  const spin = useSharedValue(0);
  const slots = useMemo(
    () => ({
      background: new PictureSlot(background, emptyPicture),
      shadow: new PictureSlot(shadow, emptyPicture),
      body: new PictureSlot(body, emptyPicture),
      sand: new PictureSlot(sand, emptyPicture),
      front: new PictureSlot(front, emptyPicture),
    }),
    [background, shadow, body, sand, front, emptyPicture],
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
    /** Cambios de fase ya vistos (null = aún no sabemos cuántos había). */
    turns: null as number | null,
    /** Inicio (performance.now) del giro de cambio de fase en curso, o null. */
    turnStart: null as number | null,
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

    /** Fin del giro: la rejilla da la vuelta y el dibujo vuelve a 0, a la vez. */
    const finishTurn = (sim: SandSimulation) => {
      if (state.populated === sim) {
        sim.rotateHalfTurn();
        // La nueva fase vacía TODO lo que ahora está arriba (como al voltear).
        state.runInitial = sim.topCount;
      }
      particles.reset(7);
      spin.value = 0;
    };

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

      const now = performance.now();
      const frameDt = state.lastTime > 0 ? (now - state.lastTime) / 1000 : 1 / 60;
      state.lastTime = now;
      // Cuántos «fotogramas de 60 fps» caben en este (1 a 60 fps; el margen
      // evita que un fotograma de 17–24 ms cuente doble).
      const ticks = Math.min(MAX_CATCH_UP, Math.max(1, Math.round(frameDt * 60 - 0.2)));

      // 0b) Cambio de fase (ciclos): empieza el giro animado del reloj.
      const turns = snap.transitions ?? 0;
      if (state.turns === null || state.populated !== p.sim) {
        state.turns = turns; // primera foto o simulación nueva: nada que girar
      } else if (turns !== state.turns) {
        state.turns = turns;
        // La fase anterior ha terminado: su arena tiene que estar abajo. Los
        // pocos granos rezagados (resbalan despacio por el embudo) pasan ya;
        // si no, tras el giro quedaban colgando bajo el cuello y bajaban
        // como un bloque.
        p.sim.flushSource(gs);
        if (p.reduceMotion) {
          // Sin animación: la arena da la vuelta en el acto.
          finishTurn(p.sim);
        } else if (state.turnStart === null) {
          state.turnStart = now;
          p.onTurnChange?.(true);
        }
        changed = true;
      }
      const turning = state.turnStart !== null;
      if (turning) {
        const t = Math.min(1, (now - (state.turnStart as number)) / TURN_MS);
        if (t < 1) {
          spin.value = Math.PI * easeInOutCubic(t);
        } else {
          finishTurn(p.sim);
          state.turnStart = null;
          p.onTurnChange?.(false);
        }
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
      // 2-3) Sincronizar y mover la arena, una vez por «fotograma de 60 fps»
      //      (a 60 fps, una vez). Durante el giro no se sincroniza: la arena
      //      va quieta dentro del vidrio.
      const syncing = snap.status !== 'idle' && state.turnStart === null;
      const target = syncing ? targetSourceGrains(state.runInitial, snap.remainingMs, snap.durationMs) : 0;
      // Límites según el caudal: con mucha arena y poco tiempo puede pasar
      // más por fotograma y no se recoloca por un simple retraso.
      const budget = syncing ? flowBudget(state.runInitial, snap.durationMs, p.sim.totalGrains) : null;
      for (let k = 0; k < ticks; k++) {
        if (budget && syncSandToTarget(p.sim, target, gs, budget) !== 'idle') changed = true;
        for (let i = 0; i < STEPS_PER_FRAME; i++) {
          if (p.sim.step(gs) > 0) changed = true;
        }
      }

      // 3b) Granos sueltos del chorro. Siguen cayendo aunque el flujo se
      //     corte: así el chorro termina con los últimos granos.
      const streaming =
        state.turnStart === null &&
        snap.status === 'running' &&
        snap.remainingMs > 0 &&
        gs.y >= MIN_FLOW_GRAVITY_Y &&
        p.sim.hasGrainAtNeck(gs);
      const pin = state.particleInput;
      pin.dt = frameDt;
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
        slots.background.publish(p.glass.recordBackground(t));
        slots.shadow.publish(p.glass.recordShadow(t));
        slots.body.publish(p.glass.recordBody(t));
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
      const keepGoing =
        snap.status === 'running' || !p.sim.isSettled || state.dirty || particles.active || turning;
      if (keepGoing) state.raf = requestAnimationFrame(frame);
      else state.lastTime = 0;
    };
    state.raf = requestAnimationFrame(frame);
  }, [live, initialRef, particles, rotation, spin, slots]);

  // Al elegir duración (o reiniciar), colocamos la arena directamente.
  useEffect(() => {
    if (status !== 'idle') return;
    const state = loop.current;
    sim.arrange(initialGrains, sim.totalGrains - initialGrains, live.current.motion.simGravity, {
      crater: 0,
    });
    state.populated = sim;
    state.runInitial = initialGrains;
    // Si estaba dando la vuelta (cambio de fase) y se reinicia, se cancela.
    if (state.turnStart !== null) live.current.onTurnChange?.(false);
    state.turnStart = null;
    spin.set(0);
    wake();
  }, [sim, status, initialGrains, wake, live, spin]);

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
      slots.background.release();
      slots.shadow.release();
      slots.body.release();
      slots.sand.release();
      slots.front.release();
    };
  }, [slots]);

  return { background, shadow, body, sand, front, rotation, spin };
}

/** Curva lento-rápido-lento (como un objeto real que se gira con la mano). */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Grosor relativo del chorro: más fino cuanto más largo es el temporizador. */
function streamIntensity(durationMs: number): number {
  const t = Math.log(durationMs / MIN_DURATION_MS) / Math.log(MAX_DURATION_MS / MIN_DURATION_MS);
  return 1 - 0.6 * Math.min(1, Math.max(0, t));
}
