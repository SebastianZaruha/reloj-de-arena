/**
 * Política de recuperación cuando el dibujo del reloj falla.
 *
 * Es lógica pura (sin React ni Skia) para poder testearla. El error boundary
 * de la app le pregunta qué hacer tras cada fallo:
 *
 *  - 'remount': volver a montar el lienzo tras `delayMs` (espera creciente
 *     para no entrar NUNCA en un bucle de errores por fotograma).
 *  - 'reload':  el motor gráfico está muerto (en web, CanvasKit abortado) y
 *     solo recargar la página lo arregla. Solo si la plataforma lo permite.
 *  - 'give-up': demasiados fallos seguidos: dejamos el fondo liso y el
 *     tiempo digital (que sigue funcionando) y no insistimos más.
 */
export type RecoveryAction =
  | { readonly type: 'remount'; readonly delayMs: number }
  | { readonly type: 'reload' }
  | { readonly type: 'give-up' };

export interface RecoveryInput {
  /** Marcas de tiempo (ms) de los fallos recientes, incluido el actual. */
  readonly failures: readonly number[];
  readonly now: number;
  /** ¿Sigue respondiendo el motor gráfico? */
  readonly engineAlive: boolean;
  /** ¿Puede la plataforma recargar la app entera? (web: sí) */
  readonly canReload: boolean;
  /** Cuándo fue la última recarga de recuperación (null si nunca). */
  readonly lastReloadAt: number | null;
}

/** Ventana en la que contamos fallos "seguidos". */
export const RECOVERY_WINDOW_MS = 60_000;
/** Remontajes permitidos dentro de la ventana. */
export const MAX_REMOUNTS = 4;
const BASE_DELAY_MS = 300;
const MAX_DELAY_MS = 8_000;

/** Fallos dentro de la ventana de tiempo. */
export function recentFailures(failures: readonly number[], now: number): number[] {
  return failures.filter((t) => Number.isFinite(t) && now - t <= RECOVERY_WINDOW_MS && t <= now);
}

export function decideRecovery(input: RecoveryInput): RecoveryAction {
  const recent = recentFailures(input.failures, input.now).length;
  if (!input.engineAlive) {
    // Remontar no sirve si el motor ha muerto. Recargamos como mucho una
    // vez por ventana: si recargar no lo arregla, no entramos en bucle.
    const reloadedRecently =
      input.lastReloadAt !== null && input.now - input.lastReloadAt <= RECOVERY_WINDOW_MS;
    return input.canReload && !reloadedRecently ? { type: 'reload' } : { type: 'give-up' };
  }
  if (recent > MAX_REMOUNTS) return { type: 'give-up' };
  const delayMs = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, recent - 1));
  return { type: 'remount', delayMs };
}
