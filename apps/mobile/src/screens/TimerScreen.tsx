/**
 * Pantalla principal: el reloj a pantalla completa, el tiempo abajo y, desde
 * la 1.5, un botón de menú discreto arriba a la derecha.
 *
 * Interacción con el reloj:
 *  - Deslizar arriba/abajo  → más/menos tiempo (la arena cambia en vivo).
 *                             En ciclos, cambia los minutos de TRABAJO
 *                             (pasa a «Personalizado»).
 *  - Tocar                  → empezar / pausar / reanudar.
 *  - Mantener pulsado       → reiniciar (vuelve al principio de la sesión).
 *
 * Menú (1.5): el botón abre una hoja de vidrio esmerilado (tema, tiempos
 * rápidos, sesión única o ciclos, sonido y vibración). Con la hoja abierta
 * los gestos del reloj se desactivan y un velo transparente recoge el
 * toque «fuera» para cerrarla: nunca se cambia el tiempo sin querer.
 *
 * Ciclos (1.5): al pasar de trabajo a descanso (y al revés) el reloj se da
 * la vuelta con una animación, la arena vuelve a caer, suena un aviso suave
 * y vibra dos veces. Encima del tiempo se lee «Trabajo 2/4» o «Descanso 2/4».
 * Al acabar la última ronda suena el aviso de fin y vibra (éxito).
 *
 * Movimiento (1.3, acelerómetro; ver src/motion/):
 *  - Inclinar         → la arena se desliza y la luz se mueve.
 *  - Tumbar de lado   → pausa (reloj desenfocado y rótulo «Pausa»).
 *  - Voltear (180°)   → como un reloj de verdad: la FASE actual empieza de
 *                       cero y la arena de abajo pasa a caer desde arriba.
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
  MINUTE_MS,
  nearestStepIndex,
  planForCycle,
  activeCycleConfig,
  samePlan,
  sessionCue,
  sessionPlanFor,
  singleSegmentPlan,
  StepTicker,
  stepToDuration,
  type OrientationEvent,
  type SessionSnapshot,
} from '@reloj/core';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
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
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HourglassBoundary } from '../components/HourglassBoundary';
import { FrostedPanel } from '../components/menu/FrostedPanel';
import { MenuButton } from '../components/menu/MenuButton';
import { SettingsSheet } from '../components/menu/SettingsSheet';
import type { MenuFonts } from '../components/menu/themedStyles';
import { useSheet } from '../components/menu/useSheet';
import { PauseLabel } from '../components/PauseLabel';
import { TIME_LINE_HEIGHT, TimeDisplay } from '../components/TimeDisplay';
import { appClock } from '../dev/devClock';
import { playSelectionTick, playTimerHaptic, useTimerHaptics } from '../haptics';
import { Hourglass, type PauseBlur } from '../hourglass';
import { useKeepAwakeWhile } from '../hooks/useKeepAwakeWhile';
import { useLatest } from '../hooks/useLatest';
import { useSession } from '../hooks/useSession';
import type { UseSettings } from '../hooks/useSettings';
import { useIntro } from '../intro/useIntro';
import { useDeviceTilt } from '../motion/useDeviceTilt';
import { saveSessionAndReload } from '../recovery/sessionRecovery';
import { useCueSound } from '../sound/useCueSound';
import { useAppTheme } from '../theme/useAppTheme';

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

export interface ScreenFonts extends MenuFonts {
  readonly time?: string;
  readonly hint?: string;
}

interface Props {
  readonly settings: UseSettings;
  readonly fonts: ScreenFonts;
}

export function TimerScreen({ settings, fonts }: Props) {
  const prefs = settings.settings;
  const { width, height } = useWindowDimensions();
  const safe = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  // Tema efectivo (Claro / Oscuro / Automático) con transición suave.
  const { theme, progress: themeProgress } = useAppTheme(prefs.theme, reduceMotion);

  const model = getHourglassModel(prefs.hourglassModelId);
  const content = getContent(prefs.contentId);

  // ─── Sesión (sesión única o ciclos) ─────────────────────────────────────
  // El plan sale de los ajustes. Si cambian (menú), la sesión vuelve al
  // reposo con el plan nuevo; si el plan es el mismo, no se toca nada.
  const plan = useMemo(
    () => sessionPlanFor(prefs),
    // `prefs` cambia con cualquier ajuste: solo nos importan estos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs.sessionMode, prefs.lastDurationMs, prefs.cyclePreset, prefs.customCycle],
  );
  const session = useSession(plan, appClock);
  const { view } = session;
  const latest = useLatest(session);
  useEffect(() => {
    if (!samePlan(plan, latest.current.state.plan)) latest.current.replacePlan(plan);
  }, [plan, latest]);

  const cycles = prefs.sessionMode === 'cycles';
  const [interacted, setInteracted] = useState(false);

  // Mantener la pantalla encendida mientras cae la arena.
  useKeepAwakeWhile(view.status === 'running');

  // Vibración al empezar / pausar / reanudar / terminar (si está activada).
  useTimerHaptics(view.status, prefs.haptics);

  // Avisos: cambio de fase y fin (sonido, vibración y lector de pantalla).
  const playCue = useCueSound(prefs.sound);
  const previousView = useRef<Pick<SessionSnapshot, 'status' | 'transitions'>>(view);
  useEffect(() => {
    const cue = sessionCue(previousView.current, view);
    previousView.current = { status: view.status, transitions: view.transitions };
    if (cue === 'phase-change') {
      playCue(cue);
      playTimerHaptic('phase');
      AccessibilityInfo.announceForAccessibility(phaseSpoken(view));
    } else if (cue === 'finished') {
      // La vibración de éxito la pone useTimerHaptics (running → finished).
      playCue(cue);
      AccessibilityInfo.announceForAccessibility(view.isCycle ? 'Ciclos terminados' : 'Tiempo terminado');
    }
    // Solo cuando cambia el estado o la fase (no en cada refresco del texto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.status, view.transitions]);

  // ─── Introducción (solo al abrir en frío) y hoja de ajustes ─────────────
  const intro = useIntro(reduceMotion);
  const sheet = useSheet(height, reduceMotion);
  const timeOpacity = useDerivedValue(() => intro.chrome.value * (1 - sheet.openness.value));
  const buttonOpacity = useDerivedValue(() => intro.chrome.value * (1 - 0.6 * sheet.openness.value));
  const toggleMenu = () => (sheet.open ? sheet.hide() : sheet.show());

  // ─── Movimiento (acelerómetro) ──────────────────────────────────────────
  // true si la pausa actual la ha causado tumbar el móvil (solo entonces se
  // reanuda al ponerlo de pie; una pausa con el dedo se respeta).
  const [tiltPaused, setTiltPaused] = useState(false);

  // (useDeviceTilt guarda siempre la versión más reciente de esta función.)
  const onMotionEvent = (event: OrientationEvent) => {
    const t = latest.current;
    // La foto más reciente, aunque React aún no haya re-renderizado.
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
        if (sheet.open) sheet.hide(); // la hoja quedaría del revés
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

  // Pausa: tumbando el móvil (desenfoque fuerte, rótulo girado) o con el
  // dedo (desenfoque ligero, rótulo derecho). En las dos, «Pausa» grande.
  const paused = view.status === 'paused';
  const blurred = tiltPaused && paused;
  const pauseBlur: PauseBlur = !paused ? 'none' : blurred ? 'full' : 'soft';

  // ─── Elegir el tiempo (deslizar y TalkBack) ─────────────────────────────
  /** Duración que se ajusta: la de la sesión única o el TRABAJO de los ciclos. */
  const adjustableMs = () => latest.current.state.plan.segments[0]?.durationMs ?? prefs.lastDurationMs;
  const cycleNow = activeCycleConfig(prefs);
  /** Aplica una duración elegida a la sesión (en vivo, sin guardar). */
  const previewDuration = (ms: number) =>
    latest.current.setPlan(
      cycles ? planForCycle({ ...cycleNow, workMin: ms / MINUTE_MS }) : singleSegmentPlan(ms),
    );
  /** Guarda la duración elegida en los ajustes. */
  const commitDuration = (ms: number) =>
    settings.update(
      cycles
        ? { cyclePreset: 'custom', customCycle: { ...cycleNow, workMin: ms / MINUTE_MS } }
        : { lastDurationMs: ms },
    );

  // ─── Gestos ─────────────────────────────────────────────────────────────
  const dragStart = useRef(adjustableMs());
  // "Clic" háptico por escalón al deslizar (como una rueda dentada). Se crea
  // una sola vez: en cada evento del gesto solo compara dos números.
  const ticker = useRef<StepTicker | null>(null);
  ticker.current ??= new StepTicker();
  // Con el menú abierto, los gestos del reloj se apagan (además, el velo y
  // la hoja lo tapan, así que tampoco recibirían toques).
  const gesturesOn = !sheet.open;

  const pan = usePanGesture({
    runOnJS: true,
    enabled: gesturesOn && view.status !== 'running',
    activeOffsetY: [-10, 10],
    failOffsetX: [-60, 60],
    onActivate: () => {
      dragStart.current = adjustableMs();
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
      if (next !== adjustableMs() || latest.current.state.timer.status !== 'idle') previewDuration(next);
    },
    onDeactivate: () => commitDuration(adjustableMs()),
  });

  const tap = useTapGesture({
    runOnJS: true,
    enabled: gesturesOn,
    onActivate: () => {
      setInteracted(true);
      // Con el dedo manda la persona: deja de ser "pausa por inclinación".
      setTiltPaused(false);
      latest.current.toggle();
    },
  });

  const longPress = useLongPressGesture({
    runOnJS: true,
    enabled: gesturesOn,
    minDuration: 650,
    onActivate: () => latest.current.restart(),
  });

  const gesture = useCompetingGestures(pan, longPress, tap);

  // ─── Accesibilidad ──────────────────────────────────────────────────────
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const t = latest.current;
    switch (event.nativeEvent.actionName) {
      case 'increment':
      case 'decrement': {
        if (t.state.timer.status === 'running') return;
        const current = adjustableMs();
        const delta = event.nativeEvent.actionName === 'increment' ? 1 : -1;
        const next = stepToDuration(nearestStepIndex(current) + delta);
        if (next !== current) playSelectionTick();
        previewDuration(next);
        commitDuration(next);
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

  // ─── Diseño ─────────────────────────────────────────────────────────────
  const insets = useMemo(
    () => ({ top: safe.top + 12, bottom: safe.bottom + BOTTOM_AREA }),
    [safe.top, safe.bottom],
  );
  const displayMs = view.status === 'idle' ? view.durationMs : view.remainingMs;
  const hint = blurred ? null : hintFor(view, interacted);
  const label = view.isCycle && view.status !== 'finished' && !blurred ? phaseLabel(view) : null;
  // Volteado: el texto y el menú giran con el reloj para leerse derechos.
  const overlayStyle = tilt.flipped ? styles.flipped : null;
  const timeFonts = useMemo(() => ({ time: fonts.time, hint: fonts.hint, label: fonts.medium }), [fonts]);

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
          aria-valuetext={accessibilityValue(view)}
          accessibilityHint="Desliza hacia arriba o hacia abajo para cambiar el tiempo. Toca dos veces para empezar o pausar."
          accessibilityActions={[
            { name: 'increment', label: 'Más tiempo' },
            { name: 'decrement', label: 'Menos tiempo' },
            { name: 'activate', label: view.status === 'running' ? 'Pausar' : 'Empezar' },
            { name: 'longpress', label: 'Reiniciar' },
          ]}
          onAccessibilityAction={onAccessibilityAction}
          // Con el menú abierto, el lector de pantalla solo ve el menú.
          importantForAccessibility={sheet.open ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={sheet.open}
          testID="reloj"
        >
          <HourglassBoundary onReload={() => saveSessionAndReload(latest.current.state)}>
            <Hourglass
              width={width}
              height={height}
              insets={insets}
              model={model}
              content={content}
              theme={theme}
              getSnapshot={session.getSnapshot}
              status={view.status}
              durationMs={view.durationMs}
              motion={tilt.motion}
              pauseBlur={pauseBlur}
              reduceMotion={reduceMotion}
              pose={intro.pose}
              poseActive={intro.active}
            >
              {sheet.visible ? (
                <FrostedPanel
                  width={width}
                  height={height}
                  top={sheet.top}
                  openness={sheet.openness}
                  themeProgress={themeProgress}
                />
              ) : null}
            </Hourglass>
          </HourglassBoundary>
        </View>
      </GestureDetector>

      <View style={[StyleSheet.absoluteFill, overlayStyle]} pointerEvents="none">
        <PauseLabel
          visible={paused}
          sideSign={blurred ? tilt.sideSign : 0}
          theme={theme}
          font={fonts.time}
          text="Pausa"
          reduceMotion={reduceMotion}
        />
        <TimeDisplay
          text={formatDuration(displayMs)}
          hint={hint}
          label={label}
          // Con el móvil volteado la capa gira 180°: su "abajo" es el borde
          // superior físico de la pantalla, así que usamos el margen seguro
          // de arriba (muesca/cámara) en lugar del de abajo.
          bottom={(tilt.flipped ? safe.top : safe.bottom) + TIME_BOTTOM}
          fonts={timeFonts}
          themeProgress={themeProgress}
          opacity={timeOpacity}
        />
      </View>

      <View style={[StyleSheet.absoluteFill, overlayStyle]} pointerEvents="box-none">
        {sheet.visible ? (
          // Velo invisible: tocar fuera de la hoja la cierra (y protege al
          // reloj de toques sin querer). El lector de pantalla usa el asa.
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={sheet.hide}
            importantForAccessibility="no"
            accessibilityElementsHidden
            testID="velo-ajustes"
          />
        ) : null}
        <SettingsSheet
          sheet={sheet}
          settings={prefs}
          update={settings.update}
          theme={theme}
          themeProgress={themeProgress}
          fonts={fonts}
          screenHeight={height}
          safeTop={tilt.flipped ? safe.bottom : safe.top}
          safeBottom={tilt.flipped ? safe.top : safe.bottom}
        />
        <MenuButton
          top={(tilt.flipped ? safe.bottom : safe.top) + 8}
          expanded={sheet.open}
          onPress={toggleMenu}
          opacity={buttonOpacity}
          themeProgress={themeProgress}
        />
      </View>
    </View>
  );
}

/** «Trabajo 2/4» / «Descanso 2/4». */
function phaseLabel(view: SessionSnapshot): string {
  return `${view.kind === 'focus' ? 'Trabajo' : 'Descanso'} ${view.round}/${view.rounds}`;
}

/** «Descanso, ronda 2 de 4» (para el lector de pantalla). */
function phaseSpoken(view: SessionSnapshot): string {
  return `${view.kind === 'focus' ? 'Trabajo' : 'Descanso'}, ronda ${view.round} de ${view.rounds}`;
}

function hintFor(view: SessionSnapshot, interacted: boolean): string | null {
  switch (view.status) {
    case 'idle':
      return interacted ? null : 'desliza para elegir · toca para empezar';
    case 'paused':
      return 'mantén pulsado para reiniciar';
    case 'finished':
      return view.isCycle ? 'ciclos completados · toca para empezar' : 'toca para volver a empezar';
    default:
      return null;
  }
}

function accessibilityValue(view: SessionSnapshot): string {
  const phase = view.isCycle ? `${phaseSpoken(view)}. ` : '';
  switch (view.status) {
    case 'idle':
      return `${phase}${describeDuration(view.durationMs)}. Listo para empezar`;
    case 'running':
      return `${phase}Quedan ${describeDuration(view.remainingMs)}`;
    case 'paused':
      return `${phase}En pausa. Quedan ${describeDuration(view.remainingMs)}`;
    case 'finished':
      return view.isCycle ? 'Ciclos terminados' : 'Tiempo terminado';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flipped: { transform: [{ rotate: '180deg' }] },
});
