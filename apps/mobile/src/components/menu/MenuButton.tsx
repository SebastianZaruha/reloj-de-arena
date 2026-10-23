/**
 * Botón del menú: sin borde ni fondo, dos rayitas finas (la de abajo más
 * corta) en un tono muy cercano al fondo, arriba a la derecha. Se nota lo
 * justo: el protagonista es el reloj.
 *
 * Área táctil de 48 × 48 px aunque el dibujo mida 20 × 9.
 */
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useT } from '../../i18n/I18n';
import { useThemedBackground } from './themedStyles';

interface Props {
  readonly top: number;
  readonly expanded: boolean;
  readonly onPress: () => void;
  /** Opacidad (introducción y hoja abierta). */
  readonly opacity: SharedValue<number>;
  readonly themeProgress: SharedValue<number>;
}

export function MenuButton({ top, expanded, onPress, opacity, themeProgress }: Props) {
  const t = useT();
  const line = useThemedBackground(themeProgress, 'menuIcon');
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[styles.wrap, { top }, fade]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t.settings}
        accessibilityHint={expanded ? t.closeSettingsHint : t.openSettings}
        aria-expanded={expanded}
        testID="boton-menu"
      >
        <Animated.View style={[styles.line, styles.long, line]} />
        <Animated.View style={[styles.line, styles.short, line]} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 10 },
  button: { width: 48, height: 48 },
  pressed: { opacity: 0.5 },
  line: { position: 'absolute', right: 14, height: 1.5, borderRadius: 1 },
  long: { top: 19, width: 20 },
  short: { top: 27, width: 13 },
});
