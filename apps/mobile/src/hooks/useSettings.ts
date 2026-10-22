/**
 * Carga y guarda los ajustes del usuario a través de la interfaz
 * `SettingsStore` del core (hoy respaldada por AsyncStorage).
 */
import {
  DEFAULT_SETTINGS,
  LocalSettingsStore,
  updateSettings,
  type Settings,
  type SettingsStore,
} from '@reloj/core';
import { useCallback, useEffect, useState } from 'react';

import { asyncStorageAdapter } from '../storage/asyncStorageAdapter';
import { useLatest } from './useLatest';

// Una única instancia para toda la app.
const defaultStore: SettingsStore = new LocalSettingsStore(asyncStorageAdapter);

export interface UseSettings {
  readonly settings: Settings;
  /** true cuando ya se han leído los ajustes guardados. */
  readonly ready: boolean;
  readonly update: (patch: Partial<Omit<Settings, 'version' | 'updatedAt'>>) => void;
}

export function useSettings(store: SettingsStore = defaultStore): UseSettings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const current = useLatest(settings);

  useEffect(() => {
    let cancelled = false;
    store
      .load()
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    // Si en el futuro llegan cambios desde otro dispositivo, los aplicamos.
    const unsubscribe = store.subscribe((s) => {
      if (!cancelled) setSettings(s);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [store]);

  const update = useCallback(
    (patch: Partial<Omit<Settings, 'version' | 'updatedAt'>>) => {
      const next = updateSettings(current.current, patch, Date.now());
      setSettings(next);
      store.save(next).catch((error: unknown) => console.warn('No se pudieron guardar los ajustes', error));
    },
    [store, current],
  );

  return { settings, ready, update };
}
