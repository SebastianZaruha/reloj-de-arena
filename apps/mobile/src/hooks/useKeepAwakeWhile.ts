/**
 * Mantiene la pantalla encendida mientras `active` sea true (útil mientras
 * cae la arena). Si la plataforma no lo soporta (algunos navegadores), no
 * pasa nada.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

const TAG = 'reloj-de-arena';

export function useKeepAwakeWhile(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    activateKeepAwakeAsync(TAG).catch(() => undefined);
    return () => {
      deactivateKeepAwake(TAG).catch(() => undefined);
    };
  }, [active]);
}
