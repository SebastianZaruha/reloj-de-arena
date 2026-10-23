/**
 * Fundido suave del reloj al cambiar de tema (1.5).
 *
 * El reloj se dibuja con shaders y SkPictures grabados con los colores del
 * tema: no se pueden «interpolar». Así que, justo ANTES de que se vean las
 * capas nuevas, hacemos una foto del lienzo (makeImageSnapshot) y la
 * dibujamos encima, desvaneciéndola en ~0,5 s. Se ve como un fundido
 * encadenado del tema viejo al nuevo.
 *
 * Por qué funciona: el tema cambia en un render de React; las capas nuevas
 * las publica el bucle de dibujo en el siguiente requestAnimationFrame. El
 * efecto de layout de abajo corre ANTES de ese fotograma, así que la foto
 * todavía tiene el tema anterior.
 *
 * Memoria: una sola imagen del tamaño de la pantalla, que se libera nada
 * más acabar el fundido (o si llega otro cambio de tema antes). Si la foto
 * falla (algún dispositivo raro), el cambio es instantáneo: no pasa nada.
 */
import type { CanvasRef, SkImage } from '@shopify/react-native-skia';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Easing, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { HourglassTheme } from '../theme/theme';
import { THEME_TRANSITION_MS } from '../theme/useAppTheme';
import { disposeLater } from './disposal';

export interface ThemeCrossfade {
  /** Foto del tema anterior (null cuando no hay fundido en curso). */
  readonly image: SkImage | null;
  readonly opacity: SharedValue<number>;
}

export function useThemeCrossfade(
  canvasRef: RefObject<CanvasRef | null>,
  theme: HourglassTheme,
  reduceMotion: boolean,
): ThemeCrossfade {
  const [image, setImage] = useState<SkImage | null>(null);
  const opacity = useSharedValue(0);
  const previous = useRef(theme);
  const current = useRef<SkImage | null>(null);
  /** Número del fundido en curso (para ignorar el final de uno ya sustituido). */
  const seq = useRef(0);

  useLayoutEffect(() => {
    if (previous.current === theme) return;
    previous.current = theme;
    if (reduceMotion) return;
    let snapshot: SkImage | null = null;
    try {
      snapshot = canvasRef.current?.makeImageSnapshot() ?? null;
    } catch {
      snapshot = null; // sin foto: cambio instantáneo
    }
    if (!snapshot) return;
    if (current.current) disposeLater([current.current]);
    current.current = snapshot;
    const id = ++seq.current;
    setImage(snapshot);
    opacity.value = 1;
    // Al acabar la animación (hilo de UI) volvemos al de JS para liberar.
    // Solo pasamos un número: los objetos Skia no deben cruzar de hilo.
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(clear, id);
    };
    opacity.value = withTiming(0, { duration: THEME_TRANSITION_MS, easing: Easing.inOut(Easing.quad) }, done);

    function clear(which: number) {
      if (which !== seq.current || !current.current) return; // ya lo sustituyó otro fundido
      const img = current.current;
      current.current = null;
      setImage(null);
      disposeLater([img]);
    }
  }, [theme, reduceMotion, canvasRef, opacity]);

  // Al desmontar, liberamos la foto que quedara.
  useEffect(
    () => () => {
      if (current.current) disposeLater([current.current]);
      current.current = null;
    },
    [],
  );

  return { image, opacity };
}
