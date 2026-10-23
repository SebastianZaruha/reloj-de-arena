/**
 * Conexión con el módulo nativo de segundo plano (1.7, Android).
 *
 *   app ──────── sync(JSON) ────────▶ notificación + alarmas exactas
 *   app ◀── getState / onChange ───── botones de la notificación
 *
 * Lo que se envía lo monta el core (`backgroundPayload`): la sesión resumida,
 * los avisos calculados con sus marcas de tiempo y los textos traducidos.
 * El módulo nativo lo guarda en disco, así que también vale con la app
 * cerrada. Si se pausa, reanuda o reinicia desde la notificación, el módulo
 * sube su contador `seq`; la app lo compara con `seenSeq` (el último que
 * conoce) y, si es más nuevo, rehace su sesión con `sessionFromBackground`.
 *
 * Sin el módulo (web, Expo Go, APK anterior a la 1.7) todo esto no hace nada.
 */
import {
  backgroundPayload,
  parseBackgroundSession,
  sessionFromBackground,
  type BackgroundSession,
  type Messages,
  type SessionPlan,
  type ThemePreference,
  type SessionState,
} from '@reloj/core';

import { BackgroundTimer } from '../../modules/background-timer';
import { countNative } from '../dev/diagnostics';

export const backgroundAvailable = BackgroundTimer !== null;

/** Último `seq` del módulo nativo que la app ya ha aplicado. */
let seenSeq = 0;
/** Último JSON enviado (para no repetir envíos iguales 4 veces por segundo). */
let lastSent: string | null = null;

interface NativeState {
  readonly session: BackgroundSession | null;
  readonly seq: number;
}

function readNative(): NativeState | null {
  if (!BackgroundTimer) return null;
  try {
    countNative('getState');
    const raw = BackgroundTimer.getState();
    if (!raw) return null;
    const r = JSON.parse(raw) as { session?: unknown; seq?: unknown };
    return {
      session: parseBackgroundSession(r.session),
      seq: typeof r.seq === 'number' && Number.isFinite(r.seq) ? r.seq : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Al arrancar la app: si Android siguió una cuenta con la app cerrada (o se
 * tocó la notificación), seguimos donde va. null si no hay nada o el plan
 * guardado no coincide con el de los ajustes.
 */
export function takeBackgroundSession(plan: SessionPlan, now: number): SessionState | null {
  const native = readNative();
  if (!native) return null;
  seenSeq = native.seq;
  return native.session ? sessionFromBackground(native.session, plan, now) : null;
}

/**
 * ¿Hay un cambio hecho desde la notificación que la app no conoce? Devuelve
 * la sesión rehecha, 'stale' si lo hay pero no se puede aplicar (otro plan),
 * o null si no hay nada nuevo.
 */
export function pendingNativeChange(plan: SessionPlan, now: number): SessionState | 'stale' | null {
  const native = readNative();
  if (!native || native.seq <= seenSeq) return null;
  seenSeq = native.seq;
  return (native.session && sessionFromBackground(native.session, plan, now)) ?? 'stale';
}

export interface SyncOptions {
  readonly sound: boolean;
  readonly vibration: boolean;
  /** Ventana flotante activada y tema elegido (1.8). */
  readonly floating: boolean;
  readonly theme: ThemePreference;
  /** Fuerza el envío aunque no haya cambiado nada (p. ej. tras dar un permiso). */
  readonly force?: boolean;
}

/**
 * Envía el estado al módulo nativo. Devuelve false si el módulo lo rechazó
 * porque hay un cambio de la notificación más nuevo (hay que ponerse al día).
 */
export function syncBackground(
  state: SessionState,
  now: number,
  tr: Messages,
  options: SyncOptions,
): boolean {
  if (!BackgroundTimer) return true;
  const json = JSON.stringify(
    backgroundPayload(state, now, tr, {
      sound: options.sound,
      vibration: options.vibration,
      floating: options.floating,
      theme: options.theme,
      seenSeq,
    }),
  );
  if (json === lastSent && !options.force) return true;
  try {
    countNative('sync');
    const accepted = BackgroundTimer.sync(json);
    lastSent = accepted ? json : null;
    return accepted;
  } catch (error) {
    console.warn('[reloj] No se pudo actualizar la notificación:', error);
    return true;
  }
}
