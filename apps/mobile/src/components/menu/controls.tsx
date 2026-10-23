/**
 * Controles del menú de ajustes: selector segmentado, chips, interruptor y
 * stepper. Todos:
 *  - tienen un área táctil de al menos 44 px (con `hitSlop` donde el dibujo
 *    es más pequeño, p. ej. los botones − / + del stepper),
 *  - exponen rol, estado y etiqueta a TalkBack / VoiceOver,
 *  - usan los colores animados de `MenuStyles` (cambian suave con el tema).
 */
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import type { MenuFonts, MenuStyles } from './themedStyles';

interface Base {
  readonly styles: MenuStyles;
  readonly fonts: MenuFonts;
  /** Sombra de la opción elegida (cambia con el tema; no se anima). */
  readonly pillShadow: string;
}

// ─── Selector segmentado (Tema; Sesión única / Ciclos) ──────────────────────

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

interface SegmentedProps<T extends string> extends Base {
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Nombre del grupo para el lector de pantalla («Tema»). */
  readonly accessibilityLabel: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  styles: s,
  fonts,
  pillShadow,
}: SegmentedProps<T>) {
  return (
    <Animated.View
      style={[st.segTrack, s.trackBg]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            style={st.segItem}
            onPress={() => onChange(o.value)}
            hitSlop={{ top: 3, bottom: 3 }}
            accessibilityRole="radio"
            aria-checked={on}
            accessibilityLabel={o.label}
            testID={`opcion-${o.value}`}
          >
            <Animated.View style={[st.segPill, on ? s.pillBg : s.clearBg, on && { boxShadow: pillShadow }]}>
              <Animated.Text
                style={[
                  st.segText,
                  { fontFamily: on ? fonts.semibold : fonts.medium },
                  on ? s.ink : s.inkSoft,
                ]}
                numberOfLines={1}
              >
                {o.label}
              </Animated.Text>
            </Animated.View>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

// ─── Chip (tiempos rápidos, preajustes de ciclo) ────────────────────────────

interface ChipProps extends Base {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  /** Lo que lee el lector de pantalla («25 minutos»). */
  readonly accessibilityLabel: string;
  readonly round?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  round = false,
  style,
  styles: s,
  fonts,
  pillShadow,
  testID,
}: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[round ? st.chipRound : st.chip, style]}
      accessibilityRole="radio"
      aria-checked={selected}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          round ? st.chipRoundBg : st.chipBg,
          selected ? s.pillBg : s.trackBg,
          selected && { boxShadow: pillShadow },
        ]}
      />
      <Animated.Text
        style={[
          round ? st.chipRoundText : st.chipText,
          { fontFamily: selected ? fonts.semibold : fonts.regular },
          selected ? s.ink : s.inkSoft,
        ]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

// ─── Interruptor (Sonido, Vibración) ────────────────────────────────────────

interface ToggleProps extends Base {
  readonly label: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Fila entera pulsable (más fácil de acertar que el interruptor solo). */
export function ToggleRow({ label, value, onChange, styles: s, fonts, style, testID }: ToggleProps) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={[st.toggleRow, style]}
      accessibilityRole="switch"
      aria-checked={value}
      accessibilityLabel={label}
      testID={testID}
    >
      <Animated.Text style={[st.toggleText, { fontFamily: fonts.medium }, s.ink]}>{label}</Animated.Text>
      <Animated.View style={[st.toggleTrack, value ? s.accentBg : s.offBg]}>
        <Animated.View style={[st.knob, value && st.knobOn, s.knobBg]} />
      </Animated.View>
    </Pressable>
  );
}

// ─── Stepper (Trabajo, Descanso, Rondas) ────────────────────────────────────

interface StepperProps extends Base {
  /** «Trabajo», «Descanso», «Rondas». */
  readonly label: string;
  readonly value: number;
  /** Unidad pequeña junto al número («min»), o nada. */
  readonly unit?: string;
  /** Texto completo para el lector de pantalla («25 minutos»). */
  readonly spoken: string;
  readonly onStep: (delta: 1 | -1) => void;
  readonly canDecrement: boolean;
  readonly canIncrement: boolean;
  readonly testID?: string;
}

/**
 * Para TalkBack es UN control «ajustable» (desliza arriba/abajo para cambiar
 * el valor); para el dedo, dos botones − / + de 26 px dibujados con 44 px de
 * área táctil.
 */
export function Stepper({
  label,
  value,
  unit,
  spoken,
  onStep,
  canDecrement,
  canIncrement,
  styles: s,
  fonts,
  testID,
}: StepperProps) {
  return (
    <View
      style={st.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      aria-valuetext={spoken}
      aria-valuenow={value}
      accessibilityActions={[
        { name: 'increment', label: 'Más' },
        { name: 'decrement', label: 'Menos' },
      ]}
      onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      testID={testID}
    >
      <View style={st.stepRow}>
        <StepButton
          glyph="−"
          enabled={canDecrement}
          onPress={() => onStep(-1)}
          styles={s}
          fonts={fonts}
          testID={testID && `${testID}-menos`}
        />
        <Animated.Text style={[st.stepValue, { fontFamily: fonts.light }, s.ink]} numberOfLines={1}>
          {value}
          {unit ? (
            <Animated.Text style={[st.stepUnit, { fontFamily: fonts.medium }, s.inkSoft]}>
              {' '}
              {unit}
            </Animated.Text>
          ) : null}
        </Animated.Text>
        <StepButton
          glyph="+"
          enabled={canIncrement}
          onPress={() => onStep(1)}
          styles={s}
          fonts={fonts}
          testID={testID && `${testID}-mas`}
        />
      </View>
      <Animated.Text style={[st.stepLabel, { fontFamily: fonts.medium }, s.inkSoft]}>{label}</Animated.Text>
    </View>
  );
}

function StepButton({
  glyph,
  enabled,
  onPress,
  styles: s,
  fonts,
  testID,
}: {
  glyph: string;
  enabled: boolean;
  onPress: () => void;
  styles: MenuStyles;
  fonts: MenuFonts;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={9}
      style={({ pressed }) => [st.stepBtn, { opacity: !enabled ? 0.35 : pressed ? 0.6 : 1 }]}
      // El contenedor ya es el control accesible: estos botones no se anuncian.
      importantForAccessibility="no"
      accessibilityElementsHidden
      testID={testID}
    >
      <Animated.View style={[StyleSheet.absoluteFill, st.stepBtnBg, s.trackBg]} />
      <Animated.Text style={[st.stepGlyph, { fontFamily: fonts.regular }, s.inkSoft]}>{glyph}</Animated.Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  segTrack: { flexDirection: 'row', borderRadius: 14, padding: 3 },
  segItem: { flex: 1, height: 42 },
  segPill: { flex: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 14, letterSpacing: 0.1 },

  chip: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chipBg: { borderRadius: 12 },
  chipText: { fontSize: 14, letterSpacing: 0.2, fontVariant: ['tabular-nums'] },
  chipRound: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  chipRoundBg: { borderRadius: 25 },
  chipRoundText: { fontSize: 17, fontVariant: ['tabular-nums'] },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 50 },
  toggleText: { fontSize: 15 },
  toggleTrack: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  knob: {
    position: 'absolute',
    left: 3,
    width: 20,
    height: 20,
    borderRadius: 10,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.2)',
  },
  knobOn: { left: 21 },

  stepper: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 32 },
  stepBtn: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  stepBtnBg: { borderRadius: 13 },
  stepGlyph: { fontSize: 16, lineHeight: 20 },
  stepValue: {
    fontSize: 23,
    lineHeight: 30,
    minWidth: 54,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  stepUnit: { fontSize: 12 },
  stepLabel: { fontSize: 11.5, letterSpacing: 0.3, marginTop: 2 },
});
