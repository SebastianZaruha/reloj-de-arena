/**
 * Marcapasos del bucle de la arena (1.8.1).
 *
 * El bucle (useSandEngine) corre en el hilo de JavaScript y publica cada
 * fotograma (un SkPicture) en un shared value; el lienzo lo dibuja en el
 * hilo de la interfaz. Con `requestAnimationFrame`, JavaScript no espera a
 * que la interfaz termine de dibujar: si en un móvil dibujar cuesta más de
 * un fotograma (vidrio, arena, desenfoques), los fotogramas se ENCOLAN y la
 * pantalla va segundos por detrás (el menú sale sin animación, el
 * desenfoque llega tarde, «Pausa» aparece cuando ya no toca).
 *
 * Aquí es la interfaz la que pide el siguiente fotograma: un
 * `useFrameCallback` (hilo de la interfaz, una vez por refresco de
 * pantalla) llama al bucle de JS solo si el anterior ya terminó. Así nunca
 * hay más de un fotograma en camino: si el móvil puede 60 fps, 60; si puede
 * 30, 30, pero siempre al día.
 *
 * Es el mismo código en Android y en la web (allí Reanimated usa
 * `requestAnimationFrame` por debajo), así que las pruebas web lo ejercitan.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export interface FramePacer {
  /** Pide que `cb` se ejecute en el próximo fotograma (solo uno pendiente a la vez). */
  request(cb: () => void): void;
  /** Olvida el fotograma pedido. */
  cancel(): void;
}

export function useFramePacer(): FramePacer {
  const next = useRef<(() => void) | null>(null);
  /** ¿Quiere JS un fotograma? / ¿Hay uno en camino? (los lee el hilo de la interfaz) */
  const wanted = useSharedValue(false);
  const busy = useSharedValue(false);

  /** Para el `useFrameCallback` cuando no queda nada pendiente (cero trabajo en reposo). */
  const stop = useRef<() => void>(() => {});

  // En el hilo de JS, cuando la interfaz pide el fotograma.
  const run = useCallback(() => {
    const cb = next.current;
    next.current = null;
    try {
      cb?.();
    } finally {
      // Si `cb` ha pedido otro, `wanted` ya está a true: se atiende en el
      // siguiente refresco, después de dibujar este.
      busy.set(false);
      if (next.current === null) stop.current();
    }
  }, [busy]);

  // En el hilo de la interfaz, una vez por refresco de pantalla.
  const frames = useFrameCallback(() => {
    'worklet';
    if (!wanted.get() || busy.get()) return;
    wanted.set(false);
    busy.set(true);
    scheduleOnRN(run);
  }, false);
  useEffect(() => {
    stop.current = () => frames.setActive(false);
  }, [frames]);

  return useMemo<FramePacer>(
    () => ({
      request(cb) {
        next.current = cb;
        wanted.set(true);
        if (!frames.isActive) frames.setActive(true);
      },
      cancel() {
        next.current = null;
        wanted.set(false);
        busy.set(false);
        frames.setActive(false);
      },
    }),
    [frames, wanted, busy],
  );
}
