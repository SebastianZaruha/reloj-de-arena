/**
 * Rótulo grande «Pausa», centrado sobre el reloj.
 *
 * Aparece en las DOS pausas (1.6):
 *  - al tumbar el móvil de lado (≈90°): se gira 90° hacia ese lado, para
 *    que se lea en horizontal desde la posición en la que está la persona;
 *  - al pausar con un toque: derecho (antes solo se veía un texto pequeño
 *    abajo y pasaba desapercibido).
 *
 * Estilo (1.3.1): 38 px, espaciado 8, un tono algo más contrastado que el
 * del tiempo (theme.text.pause) y un halo suave (sombra de texto difuminada,
 * theme.text.pauseGlow) que lo separa del reloj. Entra y sale con un
 * fundido y un ligero cambio de tamaño (con «reducir movimiento», solo el
 * fundido, más corto). Sigue montado mientras se desvanece.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { HourglassTheme } from '../theme/theme';

interface Props {
  readonly visible: boolean;
  /**
   * Hacia dónde se ha tumbado el móvil: 1 = derecha, -1 = izquierda.
   * 0 = no está tumbado (pausa con el dedo): el rótulo va derecho.
   */
  readonly sideSign: 1 | -1 | 0;
  readonly theme: HourglassTheme;
  readonly font?: string;
  /** Texto («Pausa» / «Paused»). */
  readonly text: string;
  readonly reduceMotion?: boolean;
}

export function PauseLabel({ visible, sideSign, theme, font, text, reduceMotion = false }: Props) {
  // Montado mientras se ve O se está desvaneciendo; el giro se congela al
  // salir para que no salte a «derecho» a mitad del fundido.
  const [mounted, setMounted] = useState(visible);
  const [shownSide, setShownSide] = useState(sideSign);
  if (visible && !mounted) setMounted(true); // estado derivado (en el render)
  if (visible && shownSide !== sideSign) setShownSide(sideSign);

  const shown = useSharedValue(0);
  useEffect(() => {
    if (!mounted) return;
    const hide = () => setMounted(false);
    shown.set(
      withTiming(visible ? 1 : 0, { duration: visible ? 260 : reduceMotion ? 120 : 200 }, (finished) => {
        'worklet';
        if (finished && !visible) scheduleOnRN(hide);
      }),
    );
  }, [visible, mounted, reduceMotion, shown]);

  const rotate = shownSide > 0 ? '-90deg' : shownSide < 0 ? '90deg' : '0deg';
  const anim = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ rotate }, { scale: reduceMotion ? 1 : 0.94 + 0.06 * shown.value }],
  }));

  return (
    <View
      pointerEvents="none"
      style={styles.container}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {mounted ? (
        <Animated.Text
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
            },
            anim,
          ]}
          testID="rotulo-pausa"
        >
          {text}
        </Animated.Text>
      ) : null}
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
