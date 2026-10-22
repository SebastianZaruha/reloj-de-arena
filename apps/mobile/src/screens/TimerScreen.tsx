/**
 * Pantalla principal: el reloj a pantalla completa y el tiempo abajo.
 *
 * Interacción (sin menús ni teclados):
 *  - Deslizar arriba/abajo  → más/menos tiempo (la arena cambia en vivo).
 *  - Tocar                  → empezar / pausar / reanudar.
 *  - Mantener pulsado       → reiniciar.
 *
 * Vibración (1.3): al empezar, pausar, reanudar, voltear y terminar, y un
 * "clic" por cada escalón al deslizar (ver src/haptics/).
 *
 * Movimiento (1.3, acelerómetro; ver src/motion/):
 *  - Inclinar         → la arena se desliza y la luz se mueve.
 *  - Tumbar de lado   → pausa (reloj desenfocado y rótulo «Pausa»);
 *                       al ponerlo de pie, sigue.
 *  - Voltear (180°)   → como un reloj de verdad: empieza de cero y la arena
 *                       de abajo pasa a caer desde arriba.
 *
 * Accesibilidad: el reloj es un control "ajustable": con TalkBack se
 * desliza arriba/abajo para cambiar el tiempo y doble toque para empezar.
 */
import {
  describeDuration,
  durationFromDrag,
  flipHaptic,
  formatDuration,
  getContent,
  getHourglassModel,
  nearestStepIndex,
  StepTicker,
  stepToDuration,
  type OrientationEvent,
  type TimerSnapshot,
} from '@reloj/core';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  useLongPressGesture,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HourglassBoundary } from '../components/HourglassBoundary';
import { PauseLabel } from '../components/PauseLabel';
import { TIME_LINE_HEIGHT, TimeDisplay } from '../components/TimeDisplay';
import { playSelectionTick, playTimerHaptic, useTimerHaptics } from '../haptics';
import { Hourglass } from '../hourglass';
import { useKeepAwakeWhile } from '../hooks/useKeepAwakeWhile';
import { useLatest } from '../hooks/useLatest';
import { useDeviceTilt } from '../motion/useDeviceTilt';
import type { UseSettings } from '../hooks/useSettings';
import { useTimer } from '../hooks/useTimer';
import { saveTimerAndReload } from '../recovery/sessionRecovery';
import { useCueSound } from '../sound/useCueSound';
import { themeFor } from '../theme/theme';

/** Píxeles de arrastre para avanzar un escalón de duración. */
const PX_PER_STEP = 18;
/** Espacio reservado abajo para el texto del tiempo. */
const BOTTOM_AREA = 104;
/**
 * Distancia del borde inferior del texto del tiempo al borde seguro (1.3.1).
 * Antes era 34; lo subimos la altura de una línea de texto (TIME_LINE_HEIGHT)
 * para que su borde inferior quede donde antes estaba el superior.
 */
const TIME_BOTTOM = 34 + TIME_LINE_HEIGHT;

interface Props {
  readonly settings: UseSettings;
  readonly fonts: { readonly time?: string; readonly hint?: string };
}

export function TimerScreen({ settings, fonts }: Props) {
  const scheme = useColorScheme();
  const theme = themeFor(settings.settings.theme === 'system' ? scheme : settings.settings.theme);
  const { width, height } = useWindowDimensions();
  const safe = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const model = getHourglassModel(settings.settings.hourglassModelId);
  const content = getContent(settings.settings.contentId);

  const timer = useTimer(settings.settings.lastDurationMs);
  const { view, state } = timer;
  const [interacted, setInteracted] = useState(false);

  // Mantener la pantalla encendida mientras cae la arena.
  useKeepAwakeWhile(view.status === 'running');

  // Sonido al terminar (solo si se acaba solo, no al reiniciar a mano).
  useCueSound(view.status);

  // Vibración al empezar / pausar / reanudar / terminar (si está activada).
  useTimerHaptics(view.status, settings.settings.haptics);

  // Anunciar el final a los lectores de pantalla.
  const lastStatus = useRef(view.status);
  useEffect(() => {
    if (view.status === 'finished' && lastStatus.current !== 'finished') {
      AccessibilityInfo.announceForAccessibility('Tiempo terminado');
    }
    lastStatus.current = view.status;
  }, [view.status]);

  // ─── Movimiento (acelerómetro) ────────────────────────────
  const latest = useLatest(timer);
  // true si la pausa actual la ha causado tumbar el móvil (solo entonces se
  // reanuda al ponerlo de pie; una pausa con el dedo se respeta).
  const [tiltPaused, setTiltPaused] = useState(false);

  // (useDeviceTilt guarda siempre la versión más reciente de esta función.)
  const onMotionEvent = (event: OrientationEvent) => {
    const t = latest.current;
    // `stateRef` del temporizador: el estado más reciente, aunque React aún no haya re-renderizado.
    const status = t.getSnapshot().status;
    switch (event) {
      case 'tilt-pause':
        if (status === 'running') {
          t.pause(); // la vibración de pausa la pone useTimerHaptics
          setTiltPaused(true);
        }
        break;
      case 'tilt-resume':
        if (tiltPaused && status === 'paused') t.resume();
        setTiltPaused(false);
        break;
      case 'flip': {
        t.flip();
        setTiltPaused(false);
        setInteracted(true);
        const haptic = flipHaptic(status);
        if (haptic) playTimerHaptic(haptic);
        break;
      }
    }
  };
  const tilt = useDeviceTilt({ calm: reduceMotion, onEvent: onMotionEvent });

  const blurred = tiltPaused && view.status === 'paused';

  // ─── Gestos ───────────────────────────────────────────────
  const dragStart = useRef(state.durationMs);
  // "Clic" háptico por escalón al deslizar (como una rueda dentada). Se crea
  // una sola vez: en cada evento del gesto solo compara dos números.
  const ticker = useRef<StepTicker | null>(null);
  ticker.current ??= new StepTicker();

  const pan = usePanGesture({
    runOnJS: true,
    enabled: view.status !== 'running',
    activeOffsetY: [-10, 10],
    failOffsetX: [-60, 60],
    onActivate: () => {
      dragStart.current = latest.current.state.durationMs;
      ticker.current?.reset(dragStart.current);
      setInteracted(true);
    },
    onUpdate: (e) => {
      // Volteado, la pantalla se ve girada 180°: "arriba" para la persona es
      // hacia abajo en la pantalla, así que invertimos el gesto.
      const up = tilt.motion.flipped ? e.translationY : -e.translationY;
      const next = durationFromDrag(dragStart.current, up, PX_PER_STEP);
      // Solo vibra si el escalón cambia (y como mucho cada 30 ms).
      if (ticker.current?.update(next, Date.now())) playSelectionTick();
      if (next !== latest.current.state.durationMs || latest.current.state.status !== 'idle') {
        latest.current.setDuration(next);
      }
    },
    onDeactivate: () => {
      settings.update({ lastDurationMs: latest.current.state.durationMs });
    },
  });

  const tap = useTapGesture({
    runOnJS: true,
    onActivate: () => {
      setInteracted(true);
      // Con el dedo manda la persona: deja de ser "pausa por inclinación".
      setTiltPaused(false);
      latest.current.toggle();
    },
  });

  const longPress = useLongPressGesture({
    runOnJS: true,
    minDuration: 650,
    onActivate: () => latest.current.restart(),
  });

  const gesture = useCompetingGestures(pan, longPress, tap);

  // ─── Accesibilidad ────────────────────────────────────────
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const t = latest.current;
    const index = nearestStepIndex(t.state.durationMs);
    switch (event.nativeEvent.actionName) {
      case 'increment':
      case 'decrement': {
        if (t.state.status === 'running') return;
        const next = stepToDuration(index + (event.nativeEvent.actionName === 'increment' ? 1 : -1));
        if (next !== t.state.durationMs) playSelectionTick();
        t.setDuration(next);
        settings.update({ lastDurationMs: next });
        AccessibilityInfo.announceForAccessibility(describeDuration(next));
        break;
      }
      case 'activate':
        setTiltPaused(false);
        t.toggle();
        break;
      case 'longpress':
        t.restart();
        break;
    }
  };

  // ─── Diseño ───────────────────────────────────────────────
  const insets = useMemo(
    () => ({ top: safe.top + 12, bottom: safe.bottom + BOTTOM_AREA }),
    [safe.top, safe.bottom],
  );
  const displayMs = view.status === 'idle' ? view.durationMs : view.remainingMs;
  const hint = blurred ? null : hintFor(view, interacted);
  // Volteado: el texto gira con el reloj para leerse derecho.
  const overlayStyle = tilt.flipped ? styles.flipped : null;

  return (
    <View style={[styles.root, { backgroundColor: theme.solid }]}>
      {/* Volteado, la barra de estado quedaría abajo y del revés: la ocultamos. */}
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} hidden={tilt.flipped} />
      <GestureDetector gesture={gesture}>
        <View
          style={StyleSheet.absoluteFill}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Reloj de arena"
          accessibilityValue={{ text: accessibilityValue(view) }}
          accessibilityHint="Desliza hacia arriba o hacia abajo para cambiar el tiempo. Toca dos veces para empezar o pausar."
          accessibilityActions={[
            { name: 'increment', label: 'Más tiempo' },
            { name: 'decrement', label: 'Menos tiempo' },
            { name: 'activate', label: view.status === 'running' ? 'Pausar' : 'Empezar' },
            { name: 'longpress', label: 'Reiniciar' },
          ]}
          onAccessibilityAction={onAccessibilityAction}
        >
          <HourglassBoundary onReload={() => saveTimerAndReload(latest.current.state)}>
            <Hourglass
              width={width}
              height={height}
              insets={insets}
              model={model}
              content={content}
              theme={theme}
              getSnapshot={timer.getSnapshot}
              status={view.status}
              durationMs={view.durationMs}
              motion={tilt.motion}
              blurred={blurred}
              reduceMotion={reduceMotion}
            />
          </HourglassBoundary>
        </View>
      </GestureDetector>
      <View style={[StyleSheet.absoluteFill, overlayStyle]} pointerEvents="none">
        <PauseLabel visible={blurred} sideSign={tilt.sideSign} theme={theme} font={fonts.time} />
        <TimeDisplay
          text={formatDuration(displayMs)}
          hint={hint}
          theme={theme}
          // Con el móvil volteado la capa gira 180°: su "abajo" es el borde
          // superior físico de la pantalla, así que usamos el margen seguro
          // de arriba (muesca/cámara) en lugar del de abajo.
          bottom={(tilt.flipped ? safe.top : safe.bottom) + TIME_BOTTOM}
          fonts={fonts}
        />
      </View>
    </View>
  );
}

function hintFor(view: TimerSnapshot, interacted: boolean): string | null {
  switch (view.status) {
    case 'idle':
      return interacted ? null : 'desliza para elegir · toca para empezar';
    case 'paused':
      return 'en pausa · mantén pulsado para reiniciar';
    case 'finished':
      return 'toca para volver a empezar';
    default:
      return null;
  }
}

function accessibilityValue(view: TimerSnapshot): string {
  switch (view.status) {
    case 'idle':
      return `${describeDuration(view.durationMs)}. Listo para empezar`;
    case 'running':
      return `Quedan ${describeDuration(view.remainingMs)}`;
    case 'paused':
      return `En pausa. Quedan ${describeDuration(view.remainingMs)}`;
    case 'finished':
      return 'Tiempo terminado';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flipped: { transform: [{ rotate: '180deg' }] },
});
