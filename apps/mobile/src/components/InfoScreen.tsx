/**
 * Pantalla informativa a pantalla completa, con el estilo del concepto B de
 * la fase 3: sobre el reloj (que queda desenfocado y apagado detrás),
 * contenido centrado, título pequeño en versalitas espaciadas, una × fina
 * arriba a la derecha y mucho aire.
 *
 * La usan la ayuda de gestos (1.6) y la explicación de la ventana flotante
 * (1.8). Aquí está todo lo común: aparecer y desaparecer con un fundido, el
 * velo, la cabecera, el desplazamiento si no cabe, «atrás» en Android y
 * Escape en la web, y el anuncio para el lector de pantalla. Cada pantalla
 * pone su contenido como hijos; para las filas con icono, `InfoRow`.
 */
import { Canvas, Path } from '@shopify/react-native-skia';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { HourglassTheme } from '../theme/theme';
import { useMenuStyles, type MenuFonts, type MenuStyles } from './menu/themedStyles';

export interface InfoScreenProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly theme: HourglassTheme;
  readonly themeProgress: SharedValue<number>;
  readonly fonts: MenuFonts;
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly reduceMotion?: boolean;
}

interface Props extends InfoScreenProps {
  /** Título (se muestra en MAYÚSCULAS) y lo que se anuncia al abrir. */
  readonly title: string;
  /** Nombre accesible de la ×. */
  readonly closeLabel: string;
  readonly testID: string;
  readonly closeTestID: string;
  /** El contenido; recibe los estilos del menú para seguir al tema. */
  readonly children: (styles: MenuStyles) => ReactNode;
}

/** Velo sobre el reloj (deja verlo, desenfocado, detrás). */
const VEIL = { light: 'rgba(235, 229, 221, 0.80)', dark: 'rgba(32, 27, 23, 0.84)' } as const;

export function InfoScreen({
  visible,
  onClose,
  theme,
  themeProgress,
  fonts,
  safeTop,
  safeBottom,
  reduceMotion = false,
  title,
  closeLabel,
  testID,
  closeTestID,
  children,
}: Props) {
  const s = useMenuStyles(themeProgress);

  // Montada mientras se ve o se desvanece (como el rótulo «Pausa»).
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const shown = useSharedValue(0);
  useEffect(() => {
    if (!mounted) return;
    const hide = () => setMounted(false);
    shown.set(
      withTiming(visible ? 1 : 0, { duration: reduceMotion ? 120 : visible ? 320 : 220 }, (finished) => {
        'worklet';
        if (finished && !visible) scheduleOnRN(hide);
      }),
    );
  }, [visible, mounted, reduceMotion, shown]);
  const fade = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - shown.value) * 10 }],
  }));

  // Atrás de Android / Escape en la web; aviso al lector de pantalla.
  useEffect(() => {
    if (!visible) return;
    AccessibilityInfo.announceForAccessibility(title);
    if (Platform.OS === 'web') {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
    // Solo al abrir/cerrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, onClose]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: VEIL[theme.scheme] }, fade]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityViewIsModal
      testID={testID}
    >
      {/* Tocar el fondo no hace nada (no se cierra por error al leer). */}
      <View style={[styles.head, { marginTop: safeTop + 18 }]}>
        <Animated.Text
          style={[styles.title, { fontFamily: fonts.semibold }, s.label]}
          accessibilityRole="header"
        >
          {title.toUpperCase()}
        </Animated.Text>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          hitSlop={6}
          testID={closeTestID}
        >
          <Animated.View style={[styles.xLine, styles.xA, s.inkSoftBg]} />
          <Animated.View style={[styles.xLine, styles.xB, s.inkSoftBg]} />
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: safeBottom + 40 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {children(s)}
      </ScrollView>
    </Animated.View>
  );
}

/** Una fila: icono de línea (caja de 32 × 32, trayecto SVG) y un texto grande y ligero. */
export function InfoRow({
  icon,
  text,
  color,
  fonts,
  styles: s,
}: {
  icon: string;
  text: string;
  color: string;
  fonts: MenuFonts;
  styles: MenuStyles;
}) {
  return (
    <View style={styles.row} accessible accessibilityLabel={text}>
      <Canvas style={styles.icon} pointerEvents="none">
        <Path
          path={icon}
          style="stroke"
          strokeWidth={1.35}
          strokeCap="round"
          strokeJoin="round"
          color={color}
        />
      </Canvas>
      <Animated.Text style={[styles.text, { fontFamily: fonts.light }, s.ink]}>{text}</Animated.Text>
    </View>
  );
}

/** Circunferencia como trayecto SVG (dos medias vueltas), para los iconos. */
export const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

/** Medidas comunes del contenido (para que las pantallas se parezcan). */
export const infoStyles = StyleSheet.create({
  /** Ancho máximo del contenido, centrado. */
  column: { maxWidth: 420, alignSelf: 'center', width: '100%' },
});

const styles = StyleSheet.create({
  head: { height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 11, letterSpacing: 3.2 },
  close: {
    position: 'absolute',
    right: 14,
    top: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.5 },
  xLine: { position: 'absolute', width: 20, height: 1.25, borderRadius: 1 },
  xA: { transform: [{ rotate: '45deg' }] },
  xB: { transform: [{ rotate: '-45deg' }] },
  scroll: { flex: 1 },
  body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 36, paddingTop: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  icon: { width: 32, height: 32, marginRight: 20 },
  text: { flex: 1, fontSize: 18, lineHeight: 25, letterSpacing: 0.1 },
});
