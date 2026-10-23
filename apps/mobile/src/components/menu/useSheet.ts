/**
 * Estado y animación de la hoja de ajustes.
 *
 * Todo gira en torno a UN shared value, `offset`: cuánto está la hoja
 * desplazada hacia abajo (0 = abierta del todo; `height` = escondida). De
 * él se derivan:
 *   - `top`: el canto superior en la pantalla (lo usa el vidrio Skia),
 *   - `openness`: 0..1 (velo, fundido del tiempo y del botón).
 * El gesto de arrastrar escribe en `offset` directamente (en el hilo de UI),
 * así el contenido (React Native) y el vidrio (Skia) se mueven a la vez.
 *
 * Nota: fuera de los worklets usamos `sv.get()` / `sv.set()` en lugar de
 * `sv.value`: es lo que recomienda Reanimated 4 para que las reglas del
 * React Compiler (lint) entiendan que no estamos mutando un valor de React.
 */
import { SheetToggle } from '@reloj/core';
import { useCallback, useState } from 'react';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { mark } from '../../dev/diagnostics';

/** Fin de la animación de abrir (diagnóstico): la hora se toma en el hilo de la interfaz. */
const markOpened = (at: number) => mark('animEnd', at);

export const SHEET_OPEN_MS = 340;
export const SHEET_CLOSE_MS = 260;

export interface SheetState {
  /** ¿Está abierta (o abriéndose)? */
  readonly open: boolean;
  /** ¿Hay que dibujar el vidrio? (abierta o todavía cerrándose) */
  readonly visible: boolean;
  readonly offset: SharedValue<number>;
  readonly height: SharedValue<number>;
  readonly top: SharedValue<number>;
  readonly openness: SharedValue<number>;
  readonly show: () => void;
  readonly hide: () => void;
  /**
   * Para el botón del menú (1.8.2): abre o cierra, pero ignora los toques
   * mientras la hoja se está moviendo. Así unos toques de más (p. ej. si la
   * hoja tarda en salir) no la cierran nada más abrirse.
   */
  readonly toggle: () => void;
}

export function useSheet(screenHeight: number, reduceMotion: boolean): SheetState {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  // Alto provisional hasta medir el contenido (lo fija SettingsSheet).
  const height = useSharedValue(Math.round(screenHeight * 0.7));
  const offset = useSharedValue(screenHeight);
  const top = useDerivedValue(() => screenHeight - height.value + offset.value);
  const openness = useDerivedValue(() =>
    height.value > 0 ? Math.min(1, Math.max(0, 1 - offset.value / height.value)) : 0,
  );

  // Estado real al momento (el `open` de React llega un render después) y
  // qué hacer con cada toque del botón (ver SheetToggle en el core).
  const [gate] = useState(() => new SheetToggle());

  const show = useCallback(() => {
    // Ya abierta o abriéndose: nada que hacer.
    if (!gate.show(Date.now(), reduceMotion ? 0 : SHEET_OPEN_MS)) return;
    mark('show');
    setVisible(true);
    setOpen(true);
    // Si estaba escondida del todo, empieza justo por debajo del borde.
    if (offset.get() > height.get()) offset.set(height.get());
    const opened = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(markOpened, Date.now());
    };
    offset.set(
      reduceMotion ? 0 : withTiming(0, { duration: SHEET_OPEN_MS, easing: Easing.out(Easing.cubic) }, opened),
    );
  }, [gate, offset, height, reduceMotion]);

  const hide = useCallback(() => {
    if (!gate.hide(Date.now(), reduceMotion ? 0 : SHEET_CLOSE_MS)) return;
    setOpen(false);
    const finish = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(setVisible, false);
    };
    if (reduceMotion) {
      offset.set(height.get() + 40);
      setVisible(false);
      return;
    }
    offset.set(
      withTiming(height.get() + 40, { duration: SHEET_CLOSE_MS, easing: Easing.in(Easing.quad) }, finish),
    );
  }, [gate, offset, height, reduceMotion]);

  const toggle = useCallback(() => {
    const action = gate.press(Date.now());
    if (action === 'show') show();
    if (action === 'hide') hide();
  }, [gate, show, hide]);

  return { open, visible, offset, height, top, openness, show, hide, toggle };
}
