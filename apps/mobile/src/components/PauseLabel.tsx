/**
 * Rótulo discreto «Pausa» que aparece sobre el reloj desenfocado cuando el
 * móvil se tumba de lado (≈90°).
 *
 * Se gira 90° hacia el lado al que se ha tumbado el móvil, para que se lea
 * en horizontal desde la posición en la que está la persona.
 *
 * 1.3.1: misma tipografía, pero más grande (26 → 38 px) y legible: un tono
 * algo más contrastado que el del tiempo (theme.text.pause) y un halo suave
 * (sombra de texto difuminada, theme.text.pauseGlow) que lo separa del reloj
 * desenfocado. Claro sobre oscuro en el tema oscuro, y al revés en el claro.
 */
import { StyleSheet, Text, View } from 'react-native';

import type { HourglassTheme } from '../theme/theme';

interface Props {
  readonly visible: boolean;
  /** 1 = el móvil cae hacia la derecha de la pantalla, -1 = hacia la izquierda. */
  readonly sideSign: 1 | -1;
  readonly theme: HourglassTheme;
  readonly font?: string;
}

export function PauseLabel({ visible, sideSign, theme, font }: Props) {
  if (!visible) return null;
  return (
    <View
      pointerEvents="none"
      style={styles.container}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        style={[
          styles.text,
          {
            color: theme.text.pause,
            // Halo: sin desplazamiento y muy difuminado (no una sombra dura).
            // Las tres propiedades van juntas en el mismo objeto: en web,
            // react-native-web solo crea la sombra si las ve juntas.
            textShadowColor: theme.text.pauseGlow,
            textShadowOffset: GLOW_OFFSET,
            textShadowRadius: GLOW_RADIUS,
            fontFamily: font,
            transform: [{ rotate: sideSign > 0 ? '-90deg' : '90deg' }],
          },
        ]}
      >
        Pausa
      </Text>
    </View>
  );
}

/** Halo centrado y difuminado detrás del rótulo. */
const GLOW_OFFSET = { width: 0, height: 0 } as const;
const GLOW_RADIUS = 18;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 38,
    letterSpacing: 8,
    // Margen para que el halo no se recorte en Android.
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
});
