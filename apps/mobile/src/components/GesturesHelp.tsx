/**
 * Pantalla de ayuda «Gestos» / «Gestures» (1.6): una fila por gesto REAL de
 * la app (ver TimerScreen y SettingsSheet), con un icono de línea dibujado
 * con Skia en el color de los números del menú. El marco (velo, título, ×,
 * fundido, «atrás») es `InfoScreen`.
 *
 * Se abre con el botón «?» de la hoja de ajustes y, una sola vez, sola al
 * primer arranque (tras la entrada). Se cierra con la ×, con «atrás» en
 * Android y con Escape en la web. Para el lector de pantalla es una vista
 * modal con un encabezado y una lista de textos.
 */
import { memo } from 'react';
import { useT } from '../i18n/I18n';
import { InfoRow, InfoScreen, circle, type InfoScreenProps } from './InfoScreen';

/** Iconos (caja de 32 × 32), en trazos finos. */
export const GESTURE_ICONS = {
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

type GestureKey = keyof typeof GESTURE_ICONS;
const ROWS: readonly GestureKey[] = ['tap', 'swipe', 'hold', 'side', 'flip', 'sheet'];

function GesturesHelpScreen(props: InfoScreenProps) {
  const t = useT();
  const texts: Record<GestureKey, string> = {
    tap: t.gestureTap,
    swipe: t.gestureSwipe,
    hold: t.gestureHold,
    side: t.gestureSide,
    flip: t.gestureFlip,
    sheet: t.gestureSheet,
  };
  return (
    <InfoScreen
      {...props}
      title={t.gestures}
      closeLabel={t.closeGestures}
      testID="ayuda-gestos"
      closeTestID="cerrar-gestos"
    >
      {(s) =>
        ROWS.map((key) => (
          <InfoRow
            key={key}
            icon={GESTURE_ICONS[key]}
            text={texts[key]}
            color={props.theme.ui.ink}
            fonts={props.fonts}
            styles={s}
          />
        ))
      }
    </InfoScreen>
  );
}

/** `memo`: solo se re-renderiza si cambian sus props (no con cada render de la pantalla). */
export const GesturesHelp = memo(GesturesHelpScreen);
