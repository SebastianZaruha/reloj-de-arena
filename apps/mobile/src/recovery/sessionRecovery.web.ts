/**
 * Recuperación tras un fallo gráfico grave — versión WEB.
 *
 * Si CanvasKit (Skia en WebAssembly) aborta, el módulo WASM queda inservible
 * para siempre: remontar el lienzo no basta. La única salida es recargar la
 * página. Para no perder la cuenta, guardamos antes la SESIÓN (plan, fase y
 * temporizador de la fase) en `sessionStorage` (solo vive en esta pestaña) y
 * al arrancar la recuperamos: como son marcas de tiempo, sigue exacta.
 */
import { parseSession, serializeSession, type SessionState } from '@reloj/core';

const KEY = 'reloj-de-arena:recuperacion';
const RELOAD_KEY = 'reloj-de-arena:ultima-recarga';

export const canReloadForRecovery = true;

export function saveSessionAndReload(state: SessionState): void {
  try {
    sessionStorage.setItem(KEY, serializeSession(state));
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Sin sessionStorage (modo privado estricto): recargamos igualmente.
  }
  window.location.reload();
}

export function lastRecoveryReloadAt(): number | null {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    const t = raw === null ? NaN : Number(raw);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

export function takeRecoveredSession(now: number): SessionState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    sessionStorage.removeItem(KEY);
    return parseSession(raw, now);
  } catch {
    return null;
  }
}
