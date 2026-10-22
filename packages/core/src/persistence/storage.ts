/**
 * Persistencia detrás de interfaces.
 *
 * - `KeyValueStorage`: lo mínimo que necesitamos de un almacén clave-valor.
 *   En el móvil lo implementa AsyncStorage; en tests, `MemoryStorage`; en
 *   escritorio (fase futura) podría ser un fichero o localStorage.
 * - `SettingsStore`: lo que la app usa para cargar/guardar ajustes. Hoy lo
 *   implementa `LocalSettingsStore`; mañana un `SyncedSettingsStore` podría
 *   envolverlo y sincronizar entre dispositivos sin cambiar la UI.
 */
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../settings/settings';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SettingsStore {
  load(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
  /** Avisa de cambios externos (p. ej. llegados por sincronización). */
  subscribe(listener: (settings: Settings) => void): () => void;
}

export const SETTINGS_KEY = 'reloj-de-arena/ajustes';

/** Almacén en memoria: útil para tests y como respaldo. */
export class MemoryStorage implements KeyValueStorage {
  private readonly data = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.data.delete(key);
  }
}

/** Guarda los ajustes como JSON en un `KeyValueStorage`. */
export class LocalSettingsStore implements SettingsStore {
  private readonly listeners = new Set<(s: Settings) => void>();

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key = SETTINGS_KEY,
  ) {}

  async load(): Promise<Settings> {
    try {
      const raw = await this.storage.getItem(this.key);
      if (raw === null) return DEFAULT_SETTINGS;
      return sanitizeSettings(JSON.parse(raw));
    } catch {
      // JSON roto o almacenamiento no disponible: arrancamos con valores por defecto.
      return DEFAULT_SETTINGS;
    }
  }

  async save(settings: Settings): Promise<void> {
    const clean = sanitizeSettings(settings);
    await this.storage.setItem(this.key, JSON.stringify(clean));
    this.listeners.forEach((l) => l(clean));
  }

  subscribe(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
