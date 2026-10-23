/**
 * Ventana flotante e imagen en imagen (1.8, Android): lo que necesita la
 * pantalla del reloj.
 *
 *   - `available`: solo con el módulo nativo (no en la web ni en Expo Go).
 *   - `toggle(on)`: el interruptor del menú. La PRIMERA vez que se activa
 *     sin permiso abre la pantalla que lo explica (`introOpen`); desde allí
 *     «Dar permiso» lleva a los ajustes del sistema.
 *   - `notice`: sin permiso, una línea en el menú («se usa imagen en
 *     imagen · toca para darlo»).
 *   - `pip`: la app está ahora en imagen en imagen → solo el reloj.
 *
 * Quién decide cuándo aparece la ventana es el módulo nativo (al salir de
 * la app con el reloj en marcha): aquí solo se guarda el interruptor, que
 * viaja al módulo con el resto del estado (useBackgroundTimer).
 */
import type { Messages, Settings } from '@reloj/core';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { BackgroundTimer } from '../../modules/background-timer';
import type { AlertsNotice } from './useBackgroundTimer';
import { readPermissions } from './useBackgroundTimer';

type SettingsPatch = Partial<Omit<Settings, 'version' | 'updatedAt'>>;

export interface FloatingWindow {
  readonly available: boolean;
  readonly enabled: boolean;
  /** Cambia el interruptor. Devuelve true si se abre la explicación (hay que cerrar el menú). */
  readonly toggle: (on: boolean) => boolean;
  readonly notice: AlertsNotice | null;
  readonly introOpen: boolean;
  /** «Dar permiso»: cierra la explicación y abre «Mostrar sobre otras apps». */
  readonly allow: () => void;
  /** «Ahora no» o la ×: se queda activada (con imagen en imagen). */
  readonly closeIntro: () => void;
  readonly pip: boolean;
}

/**
 * Solo en desarrollo y en la web: `?pip` en la URL muestra el diseño de
 * imagen en imagen (para verlo sin un móvil, en una ventana pequeña).
 */
const DEV_PIP =
  __DEV__ &&
  Platform.OS === 'web' &&
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('pip');

function inPictureInPicture(): boolean {
  try {
    return BackgroundTimer?.isInPictureInPicture() ?? false;
  } catch {
    return false;
  }
}

export function useFloatingWindow(settings: Settings, update: (patch: SettingsPatch) => void, tr: Messages) {
  const native = BackgroundTimer;
  const [canDraw, setCanDraw] = useState(() => readPermissions().overlay);
  const [introOpen, setIntroOpen] = useState(false);
  const [pip, setPip] = useState(inPictureInPicture);

  useEffect(() => {
    if (!native) return;
    // Al volver (p. ej. de los ajustes del sistema) se relee el permiso.
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') setCanDraw(readPermissions().overlay);
    });
    const pipChange = native.addListener('onPictureInPicture', ({ active }) => setPip(active));
    return () => {
      app.remove();
      pipChange.remove();
    };
  }, [native]);

  const openSettings = useCallback(() => native?.openOverlaySettings(), [native]);
  // Estables entre renders: FloatingHelp es `memo` y no se re-renderiza por ellas.
  const allow = useCallback(() => {
    setIntroOpen(false);
    openSettings();
  }, [openSettings]);
  const closeIntro = useCallback(() => setIntroOpen(false), []);

  const toggle = (on: boolean) => {
    const explain = on && !canDraw && !settings.floatingExplained;
    update(explain ? { floatingWindow: on, floatingExplained: true } : { floatingWindow: on });
    if (explain) setIntroOpen(true);
    return explain;
  };

  const window: FloatingWindow = {
    available: native !== null,
    enabled: settings.floatingWindow,
    toggle,
    notice:
      native && settings.floatingWindow && !canDraw
        ? { text: tr.floatingPipNotice, onPress: openSettings }
        : null,
    introOpen,
    allow,
    closeIntro,
    pip: pip || DEV_PIP,
  };
  return window;
}
