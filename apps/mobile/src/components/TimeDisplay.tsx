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
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { DARK_THEME, LIGHT_THEME } from '../theme/theme';

/**
 * Alto de línea del tiempo (px). Fijo para que mida lo mismo en Android, iOS
 * y web; TimerScreen lo usa para colocar el texto (ver TIME_BOTTOM).
 */
export const TIME_LINE_HEIGHT = 44;

/** Cada cuánto se mira si el texto ha cambiado mientras corre el tiempo (ms). */
const REFRESH_MS = 250;

interface Props {
  /** Texto en el último render de la pantalla. */
  readonly text: string;
  /**
   * Mientras corre el tiempo (1.8.1), el texto se pide aquí cada 250 ms y
   * solo se re-renderiza ESTE componente (y solo si cambia, una vez por
   * segundo). Así la pantalla entera no se vuelve a pintar 4 veces por segundo.
   */
  readonly refresh?: (() => string) | null;
  readonly hint: string | null;
  readonly label?: string | null;
  readonly bottom: number;
  readonly fonts: { readonly time?: string; readonly hint?: string; readonly label?: string };
  readonly themeProgress: SharedValue<number>;
  readonly opacity: SharedValue<number>;
}

const L = LIGHT_THEME.text;
const D = DARK_THEME.text;

export function TimeDisplay({
  text,
  refresh = null,
  hint,
  label = null,
  bottom,
  fonts,
  themeProgress,
  opacity,
}: Props) {
  const shown = useLiveText(text, refresh);
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
        {shown}
      </Animated.Text>
    </Animated.View>
  );
}

/**
 * El texto que se ve: el de la pantalla o, mientras hay `refresh`, el que
 * devuelve cada REFRESH_MS. Si la pantalla manda un texto nuevo (pausa,
 * cambio de fase...), se usa ese al momento.
 */
function useLiveText(text: string, refresh: (() => string) | null): string {
  const [live, setLive] = useState<{ base: string; value: string } | null>(null);
  useEffect(() => {
    if (!refresh) return;
    const id = setInterval(() => {
      const value = refresh();
      setLive((prev) => (prev && prev.base === text && prev.value === value ? prev : { base: text, value }));
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh, text]);
  // Un valor «vivo» de un texto anterior ya no vale.
  return refresh && live && live.base === text ? live.value : text;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // 1.6: un pelín más grandes (tiempo 30 → 34, textos 12 → 13,5; ~12 %).
  time: {
    fontSize: 34,
    lineHeight: TIME_LINE_HEIGHT,
    letterSpacing: 3,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: 13.5,
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  // Fase de los ciclos: pequeña, espaciada, en el tono del tiempo.
  label: {
    fontSize: 13.5,
    letterSpacing: 2.2,
    marginBottom: 2,
  },
});
