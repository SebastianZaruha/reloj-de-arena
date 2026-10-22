/**
 * Texto digital del tiempo, abajo del todo, en un tono muy cercano al fondo
 * (poco contraste, para que el protagonista sea el reloj).
 *
 * Es solo decorativo para la accesibilidad: el lector de pantalla obtiene
 * el tiempo a través del propio reloj (ver TimerScreen), así evitamos que
 * lo anuncie dos veces.
 */
import { StyleSheet, Text, View } from 'react-native';

import type { HourglassTheme } from '../theme/theme';

/**
 * Alto de línea del tiempo (px). Fijo para que mida lo mismo en Android, iOS
 * y web; TimerScreen lo usa para colocar el texto (ver TIME_BOTTOM).
 */
export const TIME_LINE_HEIGHT = 40;

interface Props {
  readonly text: string;
  readonly hint: string | null;
  readonly theme: HourglassTheme;
  readonly bottom: number;
  readonly fonts: { readonly time?: string; readonly hint?: string };
}

export function TimeDisplay({ text, hint, theme, bottom, fonts }: Props) {
  return (
    <View
      pointerEvents="none"
      style={[styles.container, { bottom }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {hint ? (
        <Text style={[styles.hint, { color: theme.text.hint, fontFamily: fonts.hint }]}>{hint}</Text>
      ) : null}
      <Text style={[styles.time, { color: theme.text.time, fontFamily: fonts.time }]}>{text}</Text>
    </View>
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
});
