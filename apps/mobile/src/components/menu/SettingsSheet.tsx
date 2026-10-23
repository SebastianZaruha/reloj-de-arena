/**
 * Hoja de ajustes (concepto A de la fase 3): sube desde abajo sobre el reloj
 * como un vidrio esmerilado. Aquí está la parte de React Native (textos y
 * controles, con fondo transparente); el vidrio lo dibuja `FrostedPanel` en
 * el lienzo de Skia, siguiendo el mismo `offset`.
 *
 * Se cierra:
 *   - arrastrando hacia abajo (gesto de Gesture Handler en el hilo de UI),
 *   - tocando fuera (el velo de TimerScreen),
 *   - con el botón «atrás» de Android (BackHandler; en la web, con Escape),
 *   - con el asa (botón accesible «Cerrar ajustes»).
 *
 * Si la pantalla es baja y el contenido no cabe, el cuerpo se desplaza
 * (ScrollView) y entonces solo se arrastra desde la cabecera.
 */
import {
  CYCLE_LIMITS,
  CYCLE_PRESETS,
  activeCycleConfig,
  LANGUAGE_NAMES,
  stepMinutes,
  stepRounds,
  type CycleConfig,
  type CyclePresetId,
  type LanguagePreference,
  type Messages,
  type SessionMode,
  type Settings,
  type ThemePreference,
} from '@reloj/core';
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { AlertsNotice } from '../../background/useBackgroundTimer';
import { clearHistory, mark, setDiagnostics, useDiagnostics, type GlassMode } from '../../dev/diagnostics';
import { useT } from '../../i18n/I18n';
import type { HourglassTheme } from '../../theme/theme';
import { Chip, Segmented, Stepper, ToggleRow, type SegmentOption } from './controls';
import { useMenuStyles, type MenuFonts } from './themedStyles';
import type { SheetState } from './useSheet';

/** Tiempos rápidos (minutos). */
export const QUICK_TIMES_MIN = [5, 10, 15, 25, 45, 60] as const;

const themeOptions = (t: Messages): readonly SegmentOption<ThemePreference>[] => [
  { value: 'light', label: t.themeLight },
  { value: 'dark', label: t.themeDark },
  { value: 'system', label: t.automatic },
];

/** Los nombres de idioma van siempre en su propio idioma; «Automático», en el actual. */
const languageOptions = (t: Messages): readonly SegmentOption<LanguagePreference>[] => [
  { value: 'es', label: LANGUAGE_NAMES.es },
  { value: 'en', label: LANGUAGE_NAMES.en },
  { value: 'system', label: t.automatic },
];

const modeOptions = (t: Messages): readonly SegmentOption<SessionMode>[] => [
  { value: 'single', label: t.single },
  { value: 'cycles', label: t.cycles },
];

/** Diagnóstico (1.8.3, oculto): solo en español, es para pruebas. */
const GLASS_OPTIONS: readonly SegmentOption<GlassMode>[] = [
  { value: 'live', label: 'Al abrir' },
  { value: 'premounted', label: 'Premontado' },
  { value: 'flat', label: 'Sin desenfoque' },
];

/** Opacidad de la sección que no está en uso (Tiempos rápidos o Ciclos). */
const INACTIVE_OPACITY = 0.5;
/** Arrastre (fracción del alto) o velocidad (px/s) a partir de los que se cierra. */
const CLOSE_FRACTION = 0.22;
const CLOSE_VELOCITY = 700;
const MINUTE_MS = 60_000;

type SettingsPatch = Partial<Omit<Settings, 'version' | 'updatedAt'>>;

interface Props {
  readonly sheet: SheetState;
  readonly settings: Settings;
  readonly update: (patch: SettingsPatch) => void;
  readonly theme: HourglassTheme;
  readonly themeProgress: SharedValue<number>;
  readonly fonts: MenuFonts;
  readonly screenHeight: number;
  /** Márgenes seguros (muesca, barra de gestos). */
  readonly safeTop: number;
  readonly safeBottom: number;
  /** Abre la ayuda de gestos (botón «?» de la cabecera). */
  readonly onShowGestures: () => void;
  /** Falta un permiso de los avisos en segundo plano (1.7, Android): texto y arreglo. */
  readonly alertsNotice?: AlertsNotice | null;
  /** Interruptor «Ventana flotante» (1.8, solo Android con el módulo nativo). */
  readonly floating?: {
    readonly value: boolean;
    readonly onChange: (on: boolean) => void;
    readonly notice: AlertsNotice | null;
  } | null;
  /** ¿Está encendido el lector de pantalla? (para el aviso al abrir) */
  readonly screenReader?: boolean;
  /** Referencia a la vista de la hoja (la mide el diagnóstico). */
  readonly viewRef?: AnimatedRef<Animated.View>;
}

export function SettingsSheet({
  sheet,
  settings,
  update,
  theme,
  themeProgress,
  fonts,
  screenHeight,
  safeTop,
  safeBottom,
  onShowGestures,
  alertsNotice = null,
  floating = null,
  screenReader = false,
  viewRef,
}: Props) {
  const t = useT();
  const s = useMenuStyles(themeProgress);
  const base = { styles: s, fonts, pillShadow: theme.ui.pillShadow };
  const { open, visible, hide, offset, height } = sheet;
  const diag = useDiagnostics();

  // Diagnóstico: primer render de la hoja abierta ya aplicado.
  useLayoutEffect(() => {
    if (open) mark('commit');
  }, [open]);

  // ─── Alto: el del contenido, sin pasar de casi toda la pantalla ─────────
  const maxHeight = screenHeight - safeTop - 56;
  const [headerH, setHeaderH] = useState(0);
  const [bodyH, setBodyH] = useState(0);
  const natural = headerH + bodyH + safeBottom + 14;
  const sheetHeight = Math.min(natural, maxHeight);
  const scrollable = natural > maxHeight + 0.5;
  useEffect(() => {
    if (headerH > 0 && bodyH > 0) {
      height.set(sheetHeight);
      // Escondida del todo, se queda justo por debajo del borde con el alto
      // nuevo. Ojo: comprobamos `visible` y no `open`; si no, al cerrar este
      // efecto cortaría la animación de salida (y la hoja «saltaría»).
      if (!visible) offset.set(sheetHeight + 40);
    }
  }, [sheetHeight, headerH, bodyH, visible, height, offset]);

  // ─── Atrás de Android ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    // Solo con el lector de pantalla encendido (1.8.3): sin él, el aviso no
    // sirve de nada y en Android pasa por el sistema de accesibilidad.
    if (screenReader) AccessibilityInfo.announceForAccessibility(t.settings);
    if (Platform.OS === 'web') {
      // En la web no hay botón «atrás» del sistema: usamos la tecla Escape.
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') hide();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      hide();
      return true; // ya lo hemos gestionado: no salir de la app
    });
    return () => sub.remove();
    // Solo al abrir (no al cambiar de idioma con la hoja abierta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hide]);

  // ─── Arrastrar hacia abajo para cerrar ──────────────────────────────────
  const makePan = (enabled: boolean) => ({
    enabled: enabled && open,
    activeOffsetY: 8, // solo hacia abajo
    failOffsetX: [-24, 24] as [number, number],
    onUpdate: (e: { translationY: number }) => {
      'worklet';
      // Hacia arriba ofrece un poco de resistencia (efecto goma).
      const y = e.translationY;
      offset.value = y >= 0 ? y : -Math.sqrt(-y) * 2;
    },
    onDeactivate: (e: { translationY: number; velocityY: number }) => {
      'worklet';
      if (e.translationY > height.value * CLOSE_FRACTION || e.velocityY > CLOSE_VELOCITY) {
        scheduleOnRN(hide);
      } else {
        offset.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      }
    },
  });
  const headerPan = usePanGesture(makePan(true));
  const bodyPan = usePanGesture(makePan(!scrollable));

  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  // ─── Valores mostrados ──────────────────────────────────────────────────
  const cycles = settings.sessionMode === 'cycles';
  const cycle = activeCycleConfig(settings);
  const lastMin = Math.round(settings.lastDurationMs / MINUTE_MS);
  const summary = cycles
    ? t.summaryCycles(cycle.workMin, cycle.breakMin, cycle.rounds)
    : t.summarySingle(formatMinutes(lastMin));

  /** Editar un valor de ciclo pasa a «Personalizado» partiendo de lo que se ve. */
  const editCycle = (patch: Partial<CycleConfig>) =>
    update({ sessionMode: 'cycles', cyclePreset: 'custom', customCycle: { ...cycle, ...patch } });

  return (
    <Animated.View
      ref={viewRef}
      style={[styles.sheet, { height: sheetHeight || undefined }, slide]}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityViewIsModal={open}
      importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={!open}
      testID="hoja-ajustes"
    >
      <GestureDetector gesture={headerPan}>
        <View onLayout={(e) => setHeaderH(Math.ceil(e.nativeEvent.layout.height))} style={styles.header}>
          <Pressable
            onPress={hide}
            style={styles.grabArea}
            accessibilityRole="button"
            accessibilityLabel={t.closeSettings}
            testID="cerrar-ajustes"
          >
            <Animated.View style={[styles.grabber, s.grabberBg]} />
          </Pressable>
          {/* Título con el resumen debajo; a la derecha, el «?» de los gestos. */}
          <View style={styles.headRow}>
            <View style={styles.headText}>
              {/* Pulsación larga: enciende o apaga el diagnóstico (1.8.3, oculto). */}
              <Pressable
                onLongPress={() => setDiagnostics({ enabled: !diag.enabled })}
                delayLongPress={1200}
                accessible={false}
                testID="titulo-ajustes"
              >
                <Animated.Text
                  style={[styles.title, { fontFamily: fonts.medium }, s.ink]}
                  accessibilityRole="header"
                >
                  {t.settings}
                </Animated.Text>
              </Pressable>
              <Animated.Text
                style={[styles.summary, { fontFamily: fonts.regular }, s.inkSoft]}
                numberOfLines={1}
              >
                {summary}
              </Animated.Text>
            </View>
            <Pressable
              onPress={onShowGestures}
              style={({ pressed }) => [styles.helpTouch, pressed && styles.helpPressed]}
              accessibilityRole="button"
              accessibilityLabel={t.showGestures}
              testID="boton-gestos"
            >
              <Animated.View style={[styles.helpRing, s.lineBorder]}>
                <Animated.Text style={[styles.helpGlyph, { fontFamily: fonts.medium }, s.inkSoft]}>
                  ?
                </Animated.Text>
              </Animated.View>
            </Pressable>
          </View>
        </View>
      </GestureDetector>

      <GestureDetector gesture={bodyPan}>
        <ScrollView
          scrollEnabled={scrollable}
          showsVerticalScrollIndicator={scrollable}
          bounces={false}
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: safeBottom + 14 }}
        >
          <View onLayout={(e) => setBodyH(Math.ceil(e.nativeEvent.layout.height))} style={styles.body}>
            {/* Tema */}
            <Section label={t.theme} styles={s} fonts={fonts}>
              <Segmented
                {...base}
                options={themeOptions(t)}
                value={settings.theme}
                onChange={(theme) => update({ theme })}
                accessibilityLabel={t.theme}
              />
            </Section>

            {/* Idioma (1.6) */}
            <Section label={t.language} styles={s} fonts={fonts}>
              <Segmented
                {...base}
                options={languageOptions(t)}
                value={settings.language}
                onChange={(language) => update({ language })}
                accessibilityLabel={t.language}
                testID="idioma"
              />
            </Section>

            {/* Tiempos rápidos (sesión única) */}
            <Section label={t.quickTimesMin} styles={s} fonts={fonts} dimmed={cycles}>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t.quickTimes}>
                {QUICK_TIMES_MIN.map((min) => (
                  <Chip
                    {...base}
                    key={min}
                    round
                    label={String(min)}
                    selected={!cycles && lastMin === min}
                    accessibilityLabel={t.minutes(min)}
                    onPress={() => update({ sessionMode: 'single', lastDurationMs: min * MINUTE_MS })}
                    testID={`rapido-${min}`}
                  />
                ))}
              </View>
            </Section>

            {/* Sesión: única o ciclos */}
            <Section label={t.session} styles={s} fonts={fonts}>
              <Segmented
                {...base}
                options={modeOptions(t)}
                value={settings.sessionMode}
                onChange={(sessionMode) => update({ sessionMode })}
                accessibilityLabel={t.sessionType}
              />
              <View style={[styles.cycleBlock, !cycles && styles.dimmed]}>
                <View style={styles.presets} accessibilityRole="radiogroup" accessibilityLabel={t.cycle}>
                  {CYCLE_PRESETS.map((p) => (
                    <Chip
                      {...base}
                      key={p.id}
                      style={styles.preset}
                      label={`${p.config.workMin}/${p.config.breakMin}`}
                      selected={cycles && settings.cyclePreset === p.id}
                      accessibilityLabel={t.presetSpoken(p.config.workMin, p.config.breakMin)}
                      onPress={() => update({ sessionMode: 'cycles', cyclePreset: p.id })}
                      testID={`preajuste-${p.id}`}
                    />
                  ))}
                  <Chip
                    {...base}
                    style={styles.presetCustom}
                    label={t.custom}
                    selected={cycles && settings.cyclePreset === 'custom'}
                    accessibilityLabel={t.custom}
                    onPress={() => update({ sessionMode: 'cycles', cyclePreset: 'custom' as CyclePresetId })}
                    testID="preajuste-custom"
                  />
                </View>
                <Animated.View style={[styles.steppers, s.trackBg]}>
                  <Stepper
                    {...base}
                    label={t.work}
                    value={cycle.workMin}
                    unit="min"
                    spoken={t.minutes(cycle.workMin)}
                    canDecrement={cycle.workMin > CYCLE_LIMITS.minMinutes}
                    canIncrement={cycle.workMin < CYCLE_LIMITS.maxMinutes}
                    onStep={(d) => editCycle({ workMin: stepMinutes(cycle.workMin, d) })}
                    testID="paso-trabajo"
                  />
                  <Animated.View style={[styles.vline, s.lineBg]} />
                  <Stepper
                    {...base}
                    label={t.break}
                    value={cycle.breakMin}
                    unit="min"
                    spoken={t.minutes(cycle.breakMin)}
                    canDecrement={cycle.breakMin > CYCLE_LIMITS.minMinutes}
                    canIncrement={cycle.breakMin < CYCLE_LIMITS.maxMinutes}
                    onStep={(d) => editCycle({ breakMin: stepMinutes(cycle.breakMin, d) })}
                    testID="paso-descanso"
                  />
                  <Animated.View style={[styles.vline, s.lineBg]} />
                  <Stepper
                    {...base}
                    label={t.rounds}
                    value={cycle.rounds}
                    spoken={t.roundsCount(cycle.rounds)}
                    canDecrement={cycle.rounds > CYCLE_LIMITS.minRounds}
                    canIncrement={cycle.rounds < CYCLE_LIMITS.maxRounds}
                    onStep={(d) => editCycle({ rounds: stepRounds(cycle.rounds, d) })}
                    testID="paso-rondas"
                  />
                </Animated.View>
                <Animated.Text style={[styles.cycleSummary, { fontFamily: fonts.regular }, s.inkSoft]}>
                  {t.cycleSummary(cycle.workMin, cycle.breakMin, cycle.rounds)}
                </Animated.Text>
              </View>
            </Section>

            {/* Sonido y vibración */}
            <Animated.View style={[styles.hline, s.lineBg]} />
            <View style={styles.toggles}>
              <ToggleRow
                {...base}
                style={styles.toggle}
                label={t.sound}
                value={settings.sound}
                onChange={(sound) => update({ sound })}
                testID="interruptor-sonido"
              />
              <Animated.View style={[styles.toggleDivider, s.lineBg]} />
              <ToggleRow
                {...base}
                style={styles.toggle}
                label={t.vibration}
                value={settings.haptics}
                onChange={(haptics) => update({ haptics })}
                testID="interruptor-vibracion"
              />
            </View>
            {/* Ventana flotante (Android): el reloj encima de otras apps al salir. */}
            {floating ? (
              <>
                <Animated.View style={[styles.hline, styles.floatingLine, s.lineBg]} />
                <ToggleRow
                  {...base}
                  label={t.floatingWindow}
                  value={floating.value}
                  onChange={floating.onChange}
                  testID="interruptor-flotante"
                />
              </>
            ) : null}
            {/* Solo si falta un permiso: una línea discreta que lo arregla. */}
            {[alertsNotice, floating?.notice ?? null].map((notice, i) =>
              notice ? (
                <Pressable
                  key={i}
                  onPress={notice.onPress}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.notice, pressed && styles.helpPressed]}
                  testID={i === 0 ? 'aviso-permisos' : 'aviso-flotante'}
                >
                  <Animated.Text style={[styles.noticeText, { fontFamily: fonts.medium }, s.inkSoft]}>
                    {notice.text}
                  </Animated.Text>
                </Pressable>
              ) : null,
            )}
            {diag.enabled ? (
              <View style={styles.diag} testID="seccion-diagnostico">
                <Animated.View style={[styles.hline, s.lineBg]} />
                <Section label="Diagnóstico · vidrio" styles={s} fonts={fonts}>
                  <Segmented
                    {...base}
                    options={GLASS_OPTIONS}
                    value={diag.glass}
                    onChange={(glass) => setDiagnostics({ glass })}
                    accessibilityLabel="Vidrio"
                    testID="diag-vidrio"
                  />
                </Section>
                <ToggleRow
                  {...base}
                  label="Hoja sin animación"
                  value={diag.noAnimation}
                  onChange={(noAnimation) => setDiagnostics({ noAnimation })}
                  testID="diag-sin-animacion"
                />
                <ToggleRow
                  {...base}
                  label="Arena quieta con el menú"
                  value={diag.freezeSand}
                  onChange={(freezeSand) => setDiagnostics({ freezeSand })}
                  testID="diag-arena"
                />
                <Pressable
                  onPress={clearHistory}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.notice, pressed && styles.helpPressed]}
                  testID="diag-borrar"
                >
                  <Animated.Text style={[styles.noticeText, { fontFamily: fonts.medium }, s.inkSoft]}>
                    Borrar mediciones
                  </Animated.Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </GestureDetector>
    </Animated.View>
  );
}

function Section({
  label,
  children,
  styles: s,
  fonts,
  dimmed = false,
}: {
  label: string;
  children: ReactNode;
  styles: ReturnType<typeof useMenuStyles>;
  fonts: MenuFonts;
  dimmed?: boolean;
}) {
  return (
    <View style={styles.section}>
      <Animated.Text
        style={[styles.label, { fontFamily: fonts.semibold }, s.label, dimmed && styles.dimmed]}
        accessibilityRole="header"
      >
        {label.toUpperCase()}
      </Animated.Text>
      <View style={dimmed ? styles.dimmed : null}>{children}</View>
    </View>
  );
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  header: { paddingHorizontal: 26 },
  grabArea: { alignSelf: 'center', width: 88, height: 30, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 36, height: 4, borderRadius: 2 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 16,
  },
  headText: { flexShrink: 1 },
  title: { fontSize: 19, letterSpacing: 0.2 },
  summary: { fontSize: 12, marginTop: 3, letterSpacing: 0.2 },
  // «?» discreto: anillo fino de 28 px con 44 px de área táctil.
  helpTouch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  helpPressed: { opacity: 0.5 },
  helpRing: {
    opacity: 0.75,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpGlyph: { fontSize: 14, lineHeight: 18 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 26 },
  section: { marginBottom: 22 },
  label: { fontSize: 10.5, letterSpacing: 1.8, marginBottom: 10 },
  dimmed: { opacity: INACTIVE_OPACITY },
  chips: { flexDirection: 'row', justifyContent: 'space-between' },
  cycleBlock: { marginTop: 10 },
  presets: { flexDirection: 'row', gap: 6 },
  // Los preajustes se reparten el sitio que deja «Personalizado», que toma
  // solo el ancho de su texto (así nunca se corta, ni en móviles estrechos).
  preset: { flex: 1, paddingHorizontal: 0 },
  presetCustom: { flexGrow: 0, flexShrink: 0, paddingHorizontal: 12 },
  steppers: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 16,
    marginTop: 10,
    paddingHorizontal: 2,
  },
  vline: { width: StyleSheet.hairlineWidth, marginVertical: 14 },
  cycleSummary: { fontSize: 12, textAlign: 'center', marginTop: 9, letterSpacing: 0.2 },
  hline: { height: StyleSheet.hairlineWidth },
  floatingLine: { marginTop: 2 },
  toggles: { flexDirection: 'row', alignItems: 'center', paddingTop: 2 },
  toggle: { flex: 1 },
  toggleDivider: { width: StyleSheet.hairlineWidth, height: 26, marginHorizontal: 20 },
  notice: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  diag: { marginTop: 10 },
  noticeText: { fontSize: 12, textAlign: 'center', letterSpacing: 0.2, textDecorationLine: 'underline' },
});
