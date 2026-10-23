/**
 * Pantalla de ayuda «Gestos» / «Gestures» (1.6), con el estilo del
 * concepto B de la fase 3: a pantalla completa sobre el reloj (que queda
 * desenfocado y apagado detrás), contenido centrado, título pequeño en
 * versalitas espaciadas, una × fina arriba a la derecha y letra Manrope
 * grande y ligera, con mucho aire.
 *
 * Una fila por gesto REAL de la app (ver TimerScreen y SettingsSheet), con
 * un icono de línea dibujado con Skia en el color de los números del menú.
 *
 * Se abre con el botón «?» de la hoja de ajustes y, una sola vez, sola al
 * primer arranque (tras la entrada). Se cierra con la ×, con «atrás» en
 * Android y con Escape en la web. Para el lector de pantalla es una vista
 * modal con un encabezado y una lista de textos.
 */
import { Canvas, Path } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
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

import { useT } from '../i18n/I18n';
import type { HourglassTheme } from '../theme/theme';
import { useMenuStyles, type MenuFonts } from './menu/themedStyles';

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly theme: HourglassTheme;
  readonly themeProgress: SharedValue<number>;
  readonly fonts: MenuFonts;
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly reduceMotion?: boolean;
}

/** Circunferencia como trayecto SVG (dos medias vueltas). */
const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;

/** Iconos (caja de 32 × 32), en trazos finos. */
const ICONS = {
  // Toque: un punto y un anillo alrededor.
  tap: `${circle(16, 16, 2.6)} ${circle(16, 16, 9)}`,
  // Deslizar con un dedo: una línea vertical con flechas arriba y abajo.
  swipe: 'M16 5 V27 M11.5 9.5 L16 5 L20.5 9.5 M11.5 22.5 L16 27 L20.5 22.5',
  // Mantener pulsado: un punto con dos anillos.
  hold: `${circle(16, 16, 2.6)} ${circle(16, 16, 7.5)} ${circle(16, 16, 12.5)}`,
  // Tumbar de lado: el móvil en horizontal con el símbolo de pausa.
  side: 'M6 9.5 H26 A3 3 0 0 1 29 12.5 V19.5 A3 3 0 0 1 26 22.5 H6 A3 3 0 0 1 3 19.5 V12.5 A3 3 0 0 1 6 9.5 Z M14 13 V19 M18 13 V19',
  // Voltear: el móvil y una flecha curva que da la vuelta.
  flip: 'M8 5 H15 A2.5 2.5 0 0 1 17.5 7.5 V24.5 A2.5 2.5 0 0 1 15 27 H8 A2.5 2.5 0 0 1 5.5 24.5 V7.5 A2.5 2.5 0 0 1 8 5 Z M22 8 A8.5 8.5 0 0 1 22 24 M22 24 L25.2 24.6 M22 24 L23.4 21.1',
  // Cerrar el menú: una hoja con su asa y una flecha hacia abajo.
  sheet: 'M5 20 H27 V28 H5 Z M13 23.5 H19 M16 3.5 V14 M12 10 L16 14 L20 10',
};

type GestureKey = keyof typeof ICONS;
const ROWS: readonly GestureKey[] = ['tap', 'swipe', 'hold', 'side', 'flip', 'sheet'];

/** Velo sobre el reloj (deja verlo, desenfocado, detrás). */
const VEIL = { light: 'rgba(235, 229, 221, 0.80)', dark: 'rgba(32, 27, 23, 0.84)' } as const;

export function GesturesHelp({
  visible,
  onClose,
  theme,
  themeProgress,
  fonts,
  safeTop,
  safeBottom,
  reduceMotion = false,
}: Props) {
  const t = useT();
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
    AccessibilityInfo.announceForAccessibility(t.gestures);
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
  const ink = theme.ui.ink;
  const texts: Record<GestureKey, string> = {
    tap: t.gestureTap,
    swipe: t.gestureSwipe,
    hold: t.gestureHold,
    side: t.gestureSide,
    flip: t.gestureFlip,
    sheet: t.gestureSheet,
  };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: VEIL[theme.scheme] }, fade]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityViewIsModal
      testID="ayuda-gestos"
    >
      {/* Tocar el fondo no hace nada (no se cierra por error al leer). */}
      <View style={[styles.head, { marginTop: safeTop + 18 }]}>
        <Animated.Text
          style={[styles.title, { fontFamily: fonts.semibold }, s.label]}
          accessibilityRole="header"
        >
          {t.gestures.toUpperCase()}
        </Animated.Text>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t.closeGestures}
          hitSlop={6}
          testID="cerrar-gestos"
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
        {ROWS.map((key) => (
          <View key={key} style={styles.row} accessible accessibilityLabel={texts[key]}>
            <Canvas style={styles.icon} pointerEvents="none">
              <Path
                path={ICONS[key]}
                style="stroke"
                strokeWidth={1.35}
                strokeCap="round"
                strokeJoin="round"
                color={ink}
              />
            </Canvas>
            <Animated.Text style={[styles.text, { fontFamily: fonts.light }, s.ink]}>
              {texts[key]}
            </Animated.Text>
          </View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

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
