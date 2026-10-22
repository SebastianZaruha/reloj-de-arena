/**
 * Modelo de ajustes del usuario.
 *
 * Todo lo que se guarda en disco pasa por `sanitizeSettings`, que valida y
 * corrige datos corruptos o de versiones antiguas. Nunca confíes en lo que
 * lees de almacenamiento: puede venir de otra versión de la app.
 */
import { DEFAULT_CONTENT_ID, getContent } from '../catalog/contents';
import { DEFAULT_MODEL_ID, getHourglassModel } from '../catalog/hourglassModels';
import { DEFAULT_DURATION_MS, snapDuration } from '../timer/duration';

export type ThemePreference = 'system' | 'light' | 'dark';

export const SETTINGS_VERSION = 1;

export interface Settings {
  /** Versión del esquema, para migraciones futuras. */
  readonly version: number;
  /** Última duración usada (ms). */
  readonly lastDurationMs: number;
  /** Contenido elegido (arena; agua en el futuro). */
  readonly contentId: string;
  /** Modelo de reloj elegido. */
  readonly hourglassModelId: string;
  /** Tema visual (fase 1: siempre "system"). */
  readonly theme: ThemePreference;
  /**
   * Vibración al empezar, pausar, terminar y al deslizar para elegir el
   * tiempo (desde la 1.3). Aún no hay menú para cambiarlo: queda preparado.
   */
  readonly haptics: boolean;
  /**
   * Momento de la última modificación (ms). Servirá para resolver conflictos
   * cuando sincronicemos entre dispositivos ("gana el más reciente").
   */
  readonly updatedAt: number;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  version: SETTINGS_VERSION,
  lastDurationMs: DEFAULT_DURATION_MS,
  contentId: DEFAULT_CONTENT_ID,
  hourglassModelId: DEFAULT_MODEL_ID,
  theme: 'system',
  haptics: true,
  updatedAt: 0,
});

/** Convierte cualquier valor (p. ej. JSON leído de disco) en ajustes válidos. */
export function sanitizeSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
  const r = raw as Record<string, unknown>;

  const duration =
    typeof r.lastDurationMs === 'number' && Number.isFinite(r.lastDurationMs) && r.lastDurationMs > 0
      ? snapDuration(r.lastDurationMs)
      : DEFAULT_SETTINGS.lastDurationMs;

  const theme: ThemePreference =
    r.theme === 'light' || r.theme === 'dark' || r.theme === 'system' ? r.theme : DEFAULT_SETTINGS.theme;

  return {
    version: SETTINGS_VERSION,
    lastDurationMs: duration,
    contentId: getContent(typeof r.contentId === 'string' ? r.contentId : null).id,
    hourglassModelId: getHourglassModel(typeof r.hourglassModelId === 'string' ? r.hourglassModelId : null)
      .id,
    theme,
    // Ajustes guardados por versiones anteriores no traen `haptics`: activada.
    haptics: typeof r.haptics === 'boolean' ? r.haptics : DEFAULT_SETTINGS.haptics,
    updatedAt: typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0,
  };
}

/** Aplica cambios parciales y actualiza la marca de tiempo. */
export function updateSettings(
  current: Settings,
  patch: Partial<Omit<Settings, 'version' | 'updatedAt'>>,
  now: number,
): Settings {
  return sanitizeSettings({ ...current, ...patch, updatedAt: now });
}
