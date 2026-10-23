/**
 * Recuperación tras un fallo gráfico grave — versión NATIVA (Android).
 *
 * En Android Skia es código nativo y un fallo se recupera remontando el
 * lienzo, así que no hace falta recargar ni guardar nada: funciones vacías.
 * La versión web está en `sessionRecovery.web.ts` (Metro elige el archivo
 * según la plataforma, igual que con `bootstrap.ts` / `bootstrap.web.ts`).
 */
import type { SessionState } from '@reloj/core';

/** ¿Se puede recargar la app entera para recuperar Skia? */
export const canReloadForRecovery = false;

/** Guarda la sesión y recarga (no aplica en nativo). */
export function saveSessionAndReload(_state: SessionState): void {}

/** Cuándo fue la última recarga de recuperación (nunca en nativo). */
export function lastRecoveryReloadAt(): number | null {
  return null;
}

/** Devuelve (y borra) una sesión guardada antes de recargar. */
export function takeRecoveredSession(_now: number): SessionState | null {
  return null;
}
