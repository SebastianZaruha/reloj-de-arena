/**
 * Botón del menú: sin borde ni fondo, dos rayitas finas (la de abajo más
 * corta) en un tono muy cercano al fondo, arriba a la derecha. Se nota lo
 * justo: el protagonista es el reloj.
 *
 * Área táctil (1.6): TODA la zona de guarda de la esquina (MENU_GUARD_SIZE
 * desde el borde, bajo el margen seguro), aunque el dibujo mida 20 × 9. En
 * esa zona los gestos del reloj no hacen nada (ver TimerScreen), así que un
 * toque ahí solo abre el menú, nunca empieza ni pausa el tiempo.
 */
import { MENU_GUARD_SIZE } from '@reloj/core';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { beginPress, mark } from '../../dev/diagnostics';
import { useT } from '../../i18n/I18n';
import { useThemedBackground } from './themedStyles';

interface Props {
  /** Altura del dibujo: margen seguro + 8. */
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
    <Animated.View style={[styles.wrap, fade]}>
      <Pressable
        // Diagnóstico (1.8.3): cuándo llega el toque, cuándo se suelta y
        // cuándo se ejecuta el botón. Apagado no hace nada.
        onPressIn={(e) => beginPress(e.nativeEvent.timestamp)}
        onPressOut={() => mark('pressOut')}
        onPress={() => {
          mark('onPress');
          onPress();
        }}
        style={({ pressed }) => [
          styles.button,
          { height: top - 8 + MENU_GUARD_SIZE },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t.settings}
        accessibilityHint={expanded ? t.closeSettingsHint : t.openSettings}
        aria-expanded={expanded}
        testID="boton-menu"
      >
        <Animated.View style={[styles.line, { top: top + 19, width: 20 }, line]} />
        <Animated.View style={[styles.line, { top: top + 27, width: 13 }, line]} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, right: 0 },
  button: { width: MENU_GUARD_SIZE },
  pressed: { opacity: 0.5 },
  // Mismo sitio que antes: botón de 48 px a 10 px del borde, rayas a 14 px.
  line: { position: 'absolute', right: 24, height: 1.5, borderRadius: 1 },
});
