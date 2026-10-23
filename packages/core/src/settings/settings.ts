/**
 * Modelo de ajustes del usuario.
 *
 * Todo lo que se guarda en disco pasa por `sanitizeSettings`, que valida y
 * corrige datos corruptos o de versiones antiguas. Nunca confíes en lo que
 * lees de almacenamiento: puede venir de otra versión de la app.
 */
import { DEFAULT_CONTENT_ID, getContent } from '../catalog/contents';
import { DEFAULT_MODEL_ID, getHourglassModel } from '../catalog/hourglassModels';
import {
  CYCLE_PRESET_IDS,
  DEFAULT_CYCLE_PRESET,
  DEFAULT_CUSTOM_CYCLE,
  sanitizeCycleConfig,
  type CycleConfig,
  type CyclePresetId,
  type SessionMode,
} from '../session/cycles';
import type { LanguagePreference } from '../i18n/messages';
import { DEFAULT_DURATION_MS, snapDuration } from '../timer/duration';

export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Versión del esquema. 2 (app 1.5): añade sonido, modo de sesión y ciclos.
 * 3 (app 1.6): añade el idioma. Los ajustes de versiones anteriores se
 * migran solos: lo que falta toma su valor por defecto en `sanitizeSettings`.
 */
export const SETTINGS_VERSION = 3;

export interface Settings {
  /** Versión del esquema, para migraciones futuras. */
  readonly version: number;
  /** Última duración usada (ms). */
  readonly lastDurationMs: number;
  /** Contenido elegido (arena; agua en el futuro). */
  readonly contentId: string;
  /** Modelo de reloj elegido. */
  readonly hourglassModelId: string;
  /** Tema visual: claro, oscuro o automático (sigue al sistema). */
  readonly theme: ThemePreference;
  /**
   * Vibración al empezar, pausar, terminar, cambiar de fase y al deslizar
   * para elegir el tiempo. Se cambia en el menú (1.5).
   */
  readonly haptics: boolean;
  /** Idioma: español, inglés o automático (el del dispositivo) (1.6). */
  readonly language: LanguagePreference;
  /** ¿Ya se ha visto la ayuda de gestos? (se muestra sola una vez) (1.6) */
  readonly gesturesSeen: boolean;
  /** Sonido al terminar y al cambiar de fase (1.5). */
  readonly sound: boolean;
  /** Sesión única (un temporizador) o ciclos trabajo/descanso (1.5). */
  readonly sessionMode: SessionMode;
  /** Ciclo elegido: un preajuste o 'custom' (Personalizado). */
  readonly cyclePreset: CyclePresetId;
  /** Valores de «Personalizado» (se guardan aunque se elija un preajuste). */
  readonly customCycle: CycleConfig;
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
  language: 'system',
  gesturesSeen: false,
  haptics: true,
  sound: true,
  sessionMode: 'single',
  cyclePreset: DEFAULT_CYCLE_PRESET,
  customCycle: DEFAULT_CUSTOM_CYCLE,
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
    // 1.6: ajustes anteriores no traen idioma → Automático.
    language: r.language === 'es' || r.language === 'en' || r.language === 'system' ? r.language : 'system',
    gesturesSeen: r.gesturesSeen === true,
    // Ajustes guardados por versiones anteriores no traen `haptics`: activada.
    haptics: typeof r.haptics === 'boolean' ? r.haptics : DEFAULT_SETTINGS.haptics,
    // Novedades de la 1.5: si no vienen (ajustes de la 1.4), valores por defecto.
    sound: typeof r.sound === 'boolean' ? r.sound : DEFAULT_SETTINGS.sound,
    sessionMode: r.sessionMode === 'cycles' || r.sessionMode === 'single' ? r.sessionMode : 'single',
    cyclePreset: CYCLE_PRESET_IDS.includes(r.cyclePreset as CyclePresetId)
      ? (r.cyclePreset as CyclePresetId)
      : DEFAULT_SETTINGS.cyclePreset,
    customCycle: sanitizeCycleConfig(r.customCycle),
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
