/**
 * Lector de pantalla (TalkBack / VoiceOver) y refresco para él (1.8.1).
 *
 * La pantalla ya no se re-renderiza 4 veces por segundo (el texto del tiempo
 * se refresca solo). Pero el valor accesible del reloj («quedan 12 minutos»)
 * sale del render de la pantalla: con el lector encendido y el tiempo
 * corriendo, `useRefreshWhile` la vuelve a pintar una vez por segundo para
 * que lo que se lee esté al día. Sin lector, no cuesta nada.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** ¿Está encendido el lector de pantalla? Sigue los cambios en vivo. */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (alive) setEnabled(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return enabled;
}

/** Re-renderiza el componente cada `ms` mientras `active`. */
export function useRefreshWhile(active: boolean, ms: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
