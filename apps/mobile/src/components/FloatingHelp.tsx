/**
 * Explicación de la ventana flotante (1.8, Android), con el mismo estilo que
 * la ayuda de gestos (`InfoScreen`): sale la PRIMERA vez que activas
 * «Ventana flotante» sin el permiso «Mostrar sobre otras apps».
 *
 * Cuenta qué hace la ventana y sus gestos, y por qué hace falta el permiso.
 * «Dar permiso» lleva a los ajustes del sistema (Android no tiene diálogo
 * para este permiso); «Ahora no» deja la ventana activada, y entonces la app
 * usa imagen en imagen.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useT } from '../i18n/I18n';
import { GESTURE_ICONS } from './GesturesHelp';
import { InfoRow, InfoScreen, circle, infoStyles, type InfoScreenProps } from './InfoScreen';

/** Iconos propios de la ventana flotante (caja de 32 × 32). */
const ICONS = {
  // Arrastrar: una cruz con cuatro flechas.
  drag: 'M16 4 V28 M4 16 H28 M12.5 7.5 L16 4 L19.5 7.5 M12.5 24.5 L16 28 L19.5 24.5 M7.5 12.5 L4 16 L7.5 19.5 M24.5 12.5 L28 16 L24.5 19.5',
  // Pellizcar: dos flechas que se separan en diagonal.
  pinch: 'M6 26 L13 19 M6 26 V20.5 M6 26 H11.5 M26 6 L19 13 M26 6 V11.5 M26 6 H20.5',
  // Quitar: la × dentro de un círculo, abajo.
  dismiss: `${circle(16, 20, 8)} M12.8 16.8 L19.2 23.2 M19.2 16.8 L12.8 23.2 M16 3 V8.5 M13.5 6 L16 8.5 L18.5 6`,
};

interface Props extends InfoScreenProps {
  readonly onAllow: () => void;
}

function FloatingHelpScreen({ onAllow, ...props }: Props) {
  const t = useT();
  const { fonts, theme } = props;
  const rows = [
    { key: 'drag', icon: ICONS.drag, text: t.floatingDrag },
    { key: 'pinch', icon: ICONS.pinch, text: t.floatingPinch },
    { key: 'tap', icon: GESTURE_ICONS.tap, text: t.floatingTap },
    { key: 'hold', icon: GESTURE_ICONS.hold, text: t.floatingHold },
    { key: 'dismiss', icon: ICONS.dismiss, text: t.floatingDismiss },
  ];
  return (
    <InfoScreen
      {...props}
      title={t.floatingWindow}
      closeLabel={t.closeFloatingHelp}
      testID="ayuda-flotante"
      closeTestID="cerrar-ayuda-flotante"
    >
      {(s) => (
        <>
          <Animated.Text style={[styles.intro, infoStyles.column, { fontFamily: fonts.light }, s.ink]}>
            {t.floatingIntro}
          </Animated.Text>
          {rows.map((row) => (
            <InfoRow
              key={row.key}
              icon={row.icon}
              text={row.text}
              color={theme.ui.ink}
              fonts={fonts}
              styles={s}
            />
          ))}
          <Animated.Text
            style={[styles.permission, infoStyles.column, { fontFamily: fonts.regular }, s.inkSoft]}
          >
            {t.floatingPermission}
          </Animated.Text>
          <View style={[styles.buttons, infoStyles.column]}>
            <Pressable
              onPress={onAllow}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.primary,
                { boxShadow: theme.ui.pillShadow },
                pressed && styles.pressed,
              ]}
              testID="dar-permiso-flotante"
            >
              <Animated.View style={[StyleSheet.absoluteFill, styles.primaryBg, s.pillBg]} />
              <Animated.Text style={[styles.primaryText, { fontFamily: fonts.semibold }, s.ink]}>
                {t.floatingAllow}
              </Animated.Text>
            </Pressable>
            <Pressable
              onPress={props.onClose}
              accessibilityRole="button"
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
              testID="ahora-no-flotante"
            >
              <Animated.Text style={[styles.secondaryText, { fontFamily: fonts.medium }, s.inkSoft]}>
                {t.permissionNotNow}
              </Animated.Text>
            </Pressable>
          </View>
        </>
      )}
    </InfoScreen>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 22, lineHeight: 31, letterSpacing: 0.1, marginBottom: 18 },
  permission: { fontSize: 14, lineHeight: 21, letterSpacing: 0.2, marginTop: 18 },
  buttons: { marginTop: 26, alignItems: 'center' },
  primary: {
    minHeight: 48,
    paddingHorizontal: 28,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  primaryBg: { borderRadius: 24 },
  primaryText: { fontSize: 15, letterSpacing: 0.3 },
  secondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, marginTop: 6 },
  secondaryText: { fontSize: 14, letterSpacing: 0.3 },
  pressed: { opacity: 0.6 },
});

/** `memo`: solo se re-renderiza si cambian sus props (no con cada render de la pantalla). */
export const FloatingHelp = memo(FloatingHelpScreen);
