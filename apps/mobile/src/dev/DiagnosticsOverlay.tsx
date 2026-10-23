/**
 * Recuadro del diagnóstico (1.8.3), arriba a la izquierda, encima de todo
 * (también de la hoja). Solo se monta con el diagnóstico encendido.
 *
 *   - fps de JavaScript (requestAnimationFrame) y de la interfaz
 *     (useFrameCallback de Reanimated, en el hilo de la interfaz);
 *   - las últimas aperturas del menú: ms desde que el toque llega a JS
 *     hasta cada paso (ver MarkName en diagnostics.ts), las paradas largas de
 *     cada hilo y las llamadas al módulo nativo durante la apertura.
 *
 * No recibe toques (pointerEvents="none"). Se refresca 2 veces por segundo.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import type Animated from 'react-native-reanimated';
import {
  getStaticFeatureFlag,
  measure,
  useFrameCallback,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  STALL_MS,
  mark,
  openHistory,
  reportStall,
  useDiagnostics,
  type MarkName,
  type OpenRecord,
  type Stall,
} from './diagnostics';

const GLASS_NAMES = {
  live: 'vidrio al abrir',
  premounted: 'vidrio premontado',
  flat: 'sin desenfoque',
} as const;

const markUi = (name: MarkName, at: number) => mark(name, at);
const uiStall = (at: number, ms: number) => reportStall('ui', at, ms);

interface Props {
  /** 0 = hoja cerrada, 1 = abierta (shared value de useSheet). */
  readonly openness: SharedValue<number>;
  readonly top: number;
  /** La vista de la hoja (para saber cuándo el árbol de vistas la tiene movida). */
  readonly sheetRef: AnimatedRef<Animated.View>;
  readonly screenHeight: number;
}

export function DiagnosticsOverlay({ openness, top, sheetRef, screenHeight }: Props) {
  const options = useDiagnostics();
  const [fps, setFps] = useState({ js: 0, ui: 0 });
  const uiFps = useSharedValue(0);
  const frames = useSharedValue(0);
  const windowStart = useSharedValue(0);
  const prevOpen = useSharedValue(0);
  const prevMoved = useSharedValue(false);
  const [a11y, setA11y] = useState('…');
  // ¿Reanimated mueve las vistas directamente, sin esperar al árbol de React?
  const [syncProps] = useState(() => {
    try {
      return getStaticFeatureFlag('ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS') ? 'sí' : 'no';
    } catch {
      return '?';
    }
  });

  // Hilo de la interfaz: fps, paradas y cuándo se mueve / llega arriba la hoja.
  useFrameCallback((f) => {
    'worklet';
    const dt = f.timeSincePreviousFrame ?? 0;
    if (dt > STALL_MS) scheduleOnRN(uiStall, Date.now(), dt);
    frames.value += 1;
    const span = f.timestamp - windowStart.value;
    if (span >= 1000) {
      uiFps.value = (frames.value * 1000) / span;
      frames.value = 0;
      windowStart.value = f.timestamp;
    }
    const o = openness.value;
    if (prevOpen.value <= 0.001 && o > 0.001) scheduleOnRN(markUi, 'uiFirst', Date.now());
    if (prevOpen.value < 0.999 && o >= 0.999) scheduleOnRN(markUi, 'uiOpen', Date.now());
    prevOpen.value = o;
    // ¿El árbol de vistas ya tiene la hoja más arriba que cerrada?
    const m = measure(sheetRef);
    const moved = m !== null && m.pageY < screenHeight - 2;
    if (moved && !prevMoved.value) scheduleOnRN(markUi, 'uiMoved', Date.now());
    prevMoved.value = moved;
  });

  // Hilo de JS: fps y paradas (huecos entre fotogramas de requestAnimationFrame).
  useEffect(() => {
    let id = 0;
    let last = 0;
    let count = 0;
    let start = 0;
    let jsFps = 0;
    const loop = (t: number) => {
      if (last > 0 && t - last > STALL_MS) reportStall('js', Date.now(), t - last);
      last = t;
      count += 1;
      if (start === 0) start = t;
      if (t - start >= 1000) {
        jsFps = (count * 1000) / (t - start);
        count = 0;
        start = t;
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    const timer = setInterval(() => setFps({ js: jsFps, ui: uiFps.get() }), 500);
    return () => {
      cancelAnimationFrame(id);
      clearInterval(timer);
    };
  }, [uiFps]);

  // Servicios de accesibilidad (en Android, cualquiera, no solo TalkBack).
  useEffect(() => {
    const reader = AccessibilityInfo.isScreenReaderEnabled();
    const any =
      Platform.OS === 'android' ? AccessibilityInfo.isAccessibilityServiceEnabled() : Promise.resolve(false);
    Promise.all([reader, any])
      .then(([r, s]) => setA11y(`lector ${r ? 'sí' : 'no'} · servicios accesib. ${s ? 'sí' : 'no'}`))
      .catch(() => setA11y('accesibilidad: ?'));
  }, []);

  const history = openHistory();
  const lines = [
    `DIAGNÓSTICO 1.8.3 · ${GLASS_NAMES[options.glass]} · ${options.noAnimation ? 'sin animación' : 'animada'}${options.freezeSand ? ' · arena quieta' : ''}`,
    `JS ${Math.round(fps.js)} fps · UI ${Math.round(fps.ui)} fps · props directas ${syncProps} · ${a11y}`,
  ];
  if (history.length === 0) lines.push('Abre el menú para medir.');
  history.forEach((r, i) => lines.push(...describe(r, i)));

  return (
    <View pointerEvents="none" style={[styles.box, { top }]} testID="diagnostico">
      {lines.map((line, i) => (
        <Text key={i} style={[styles.text, i === 0 && styles.head]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

/** Una apertura en texto: ms desde que el toque llegó a JS. */
function describe(r: OpenRecord, index: number): string[] {
  const t0 = r.marks.pressIn ?? r.marks.onPress ?? 0;
  const at = (name: MarkName) => {
    const v = r.marks[name];
    return v === undefined ? '–' : String(Math.round(v - t0));
  };
  const stalls = (list: readonly Stall[]) =>
    list.length === 0 ? '0' : list.map((s) => `${s.ms}@${Math.round(s.at - t0)}`).join(' ');
  const calls = Object.entries(r.nativeCalls);
  const mode = `${r.glass}${r.noAnimation ? '/sin anim' : ''}${r.freezeSand ? '/arena quieta' : ''}`;
  if (index > 0) {
    return [
      `#${index + 1} ${mode}: onPress ${at('onPress')} · valor ${at('uiFirst')} · vista ${at('uiMoved')} · arriba ${at('uiOpen')}`,
    ];
  }
  return [
    `ÚLTIMA (${mode}), ms desde el toque en JS:`,
    `nativo→JS ${r.touchToJs ?? '?'} · soltar ${at('pressOut')} · onPress ${at('onPress')} · show ${at('show')}`,
    `render ${at('render')}→${at('commit')} · vidrio montado ${at('panel')}`,
    `UI: valor movido ${at('uiFirst')} · vista movida ${at('uiMoved')} · arriba ${at('uiOpen')} · fin ${at('animEnd')}`,
    `paradas UI ${stalls(r.uiStalls)} · JS ${stalls(r.jsStalls)}`,
    `llamadas nativas: ${calls.length === 0 ? 'ninguna' : calls.map(([k, n]) => `${k}×${n}`).join(' ')}`,
  ];
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 6,
    right: 70,
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.74)',
    zIndex: 1000,
    elevation: 1000,
  },
  text: {
    color: '#fff',
    fontSize: 10.5,
    lineHeight: 14,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo, monospace',
  },
  head: { fontWeight: '700' },
});
