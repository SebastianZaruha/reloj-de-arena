/**
 * Recuperación tras un fallo gráfico grave — versión NATIVA (Android).
 *
 * En Android Skia es código nativo y un fallo se recupera remontando el
 * lienzo, así que no hace falta recargar ni guardar nada: funciones vacías.
 * La versión web está en `sessionRecovery.web.ts` (Metro elige el archivo
 * según la plataforma, igual que con `bootstrap.ts` / `bootstrap.web.ts`).
 */
import type { TimerState } from '@reloj/core';

/** ¿Se puede recargar la app entera para recuperar Skia? */
export const canReloadForRecovery = false;

/** Guarda el temporizador y recarga (no aplica en nativo). */
export function saveTimerAndReload(_state: TimerState): void {}

/** Cuándo fue la última recarga de recuperación (nunca en nativo). */
export function lastRecoveryReloadAt(): number | null {
  return null;
}

/** Devuelve (y borra) un temporizador guardado antes de recargar. */
export function takeRecoveredTimer(_now: number): TimerState | null {
  return null;
}
