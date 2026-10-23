/**
 * Texto digital del tiempo, abajo del todo, en un tono muy cercano al fondo
 * (poco contraste, para que el protagonista sea el reloj).
 *
 * Encima puede llevar:
 *  - `label`: la fase de los ciclos («Trabajo 2/4», «Descanso 2/4»; 1.5),
 *  - `hint`: una pista de uso («toca para empezar»...).
 *
 * Los colores cambian suavemente con el tema (`themeProgress`) y todo se
 * desvanece con `opacity` (introducción y menú abierto).
 *
 * Es solo decorativo para la accesibilidad: el lector de pantalla obtiene
 * el tiempo y la fase a través del propio reloj (ver TimerScreen), así
 * evitamos que lo anuncie dos veces.
 */
import { StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { DARK_THEME, LIGHT_THEME } from '../theme/theme';

/**
 * Alto de línea del tiempo (px). Fijo para que mida lo mismo en Android, iOS
 * y web; TimerScreen lo usa para colocar el texto (ver TIME_BOTTOM).
 */
export const TIME_LINE_HEIGHT = 40;

interface Props {
  readonly text: string;
  readonly hint: string | null;
  readonly label?: string | null;
  readonly bottom: number;
  readonly fonts: { readonly time?: string; readonly hint?: string; readonly label?: string };
  readonly themeProgress: SharedValue<number>;
  readonly opacity: SharedValue<number>;
}

const L = LIGHT_THEME.text;
const D = DARK_THEME.text;

export function TimeDisplay({ text, hint, label = null, bottom, fonts, themeProgress, opacity }: Props) {
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const timeColor = useAnimatedStyle(() => ({
    color: interpolateColor(themeProgress.value, [0, 1], [L.time, D.time]),
  }));
  const hintColor = useAnimatedStyle(() => ({
    color: interpolateColor(themeProgress.value, [0, 1], [L.hint, D.hint]),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { bottom }, fade]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {hint ? (
        <Animated.Text style={[styles.hint, { fontFamily: fonts.hint }, hintColor]}>{hint}</Animated.Text>
      ) : null}
      {label ? (
        <Animated.Text
          style={[styles.label, { fontFamily: fonts.label ?? fonts.hint }, timeColor]}
          testID="fase"
        >
          {label}
        </Animated.Text>
      ) : null}
      <Animated.Text style={[styles.time, { fontFamily: fonts.time }, timeColor]} testID="tiempo">
        {text}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  time: {
    fontSize: 30,
    lineHeight: TIME_LINE_HEIGHT,
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  // Fase de los ciclos: pequeña, espaciada, en el tono del tiempo.
  label: {
    fontSize: 12,
    letterSpacing: 2.2,
    marginBottom: 2,
  },
});
