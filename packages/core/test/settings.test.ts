import { describe, expect, it } from 'vitest';
import {
  CLASSIC_MODEL,
  CONTENT_CATALOG,
  DEFAULT_SETTINGS,
  getContent,
  getHourglassModel,
  HOURGLASS_CATALOG,
  LocalSettingsStore,
  MemoryStorage,
  SAND,
  sanitizeSettings,
  SETTINGS_KEY,
  updateSettings,
  type KeyValueStorage,
} from '../src';

const MIN = 60_000;

describe('ajustes', () => {
  it('devuelve valores por defecto ante basura', () => {
    expect(sanitizeSettings(null)).toBe(DEFAULT_SETTINGS);
    expect(sanitizeSettings('hola')).toBe(DEFAULT_SETTINGS);
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('corrige valores fuera de rango o desconocidos', () => {
    const s = sanitizeSettings({
      lastDurationMs: 7.3 * MIN,
      contentId: 'lava',
      hourglassModelId: 'inexistente',
      theme: 'neón',
      haptics: 'sí',
      updatedAt: 'ayer',
    });
    expect(s.lastDurationMs).toBe(7 * MIN);
    expect(s.contentId).toBe(SAND.id);
    expect(s.hourglassModelId).toBe(CLASSIC_MODEL.id);
    expect(s.theme).toBe('system');
    expect(s.haptics).toBe(true);
    expect(s.updatedAt).toBe(0);
    expect(sanitizeSettings({ lastDurationMs: -3 }).lastDurationMs).toBe(DEFAULT_SETTINGS.lastDurationMs);
    expect(sanitizeSettings({ theme: 'dark' }).theme).toBe('dark');
  });

  it('la vibración está activada por defecto y se puede desactivar', () => {
    expect(DEFAULT_SETTINGS.haptics).toBe(true);
    // Ajustes de la 1.2 (sin el campo): se activa.
    expect(sanitizeSettings({ lastDurationMs: 5 * MIN }).haptics).toBe(true);
    expect(sanitizeSettings({ haptics: false }).haptics).toBe(false);
    expect(updateSettings(DEFAULT_SETTINGS, { haptics: false }, 1).haptics).toBe(false);
  });

  it('updateSettings aplica cambios y marca la fecha', () => {
    const s = updateSettings(DEFAULT_SETTINGS, { lastDurationMs: 25 * MIN }, 1234);
    expect(s.lastDurationMs).toBe(25 * MIN);
    expect(s.updatedAt).toBe(1234);
  });
});

describe('catálogos', () => {
  it('solo hay arena y un modelo en la fase 1, con respaldo por defecto', () => {
    expect(CONTENT_CATALOG).toHaveLength(1);
    expect(HOURGLASS_CATALOG).toHaveLength(1);
    expect(getContent('arena')).toBe(SAND);
    expect(getContent(undefined)).toBe(SAND);
    expect(getHourglassModel('clasico')).toBe(CLASSIC_MODEL);
    expect(getHourglassModel(null)).toBe(CLASSIC_MODEL);
    expect(SAND.kind).toBe('granular');
    expect(CLASSIC_MODEL.renderer).toBe('2.5d');
  });
});

describe('persistencia', () => {
  it('guarda y carga ajustes como JSON', async () => {
    const storage = new MemoryStorage();
    const store = new LocalSettingsStore(storage);
    expect(await store.load()).toBe(DEFAULT_SETTINGS);
    const s = updateSettings(DEFAULT_SETTINGS, { lastDurationMs: 45 * MIN }, 1);
    await store.save(s);
    expect(JSON.parse((await storage.getItem(SETTINGS_KEY)) as string).lastDurationMs).toBe(45 * MIN);
    expect((await store.load()).lastDurationMs).toBe(45 * MIN);
  });

  it('avisa a los suscriptores y permite darse de baja', async () => {
    const store = new LocalSettingsStore(new MemoryStorage());
    const seen: number[] = [];
    const off = store.subscribe((s) => seen.push(s.lastDurationMs));
    await store.save(updateSettings(DEFAULT_SETTINGS, { lastDurationMs: 2 * MIN }, 1));
    off();
    await store.save(updateSettings(DEFAULT_SETTINGS, { lastDurationMs: 3 * MIN }, 2));
    expect(seen).toEqual([2 * MIN]);
  });

  it('sobrevive a JSON corrupto y a errores del almacenamiento', async () => {
    const storage = new MemoryStorage();
    await storage.setItem(SETTINGS_KEY, '{roto');
    expect(await new LocalSettingsStore(storage).load()).toBe(DEFAULT_SETTINGS);
    const failing: KeyValueStorage = {
      getItem: () => Promise.reject(new Error('sin disco')),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    };
    expect(await new LocalSettingsStore(failing).load()).toBe(DEFAULT_SETTINGS);
    await storage.removeItem(SETTINGS_KEY);
    expect(await storage.getItem(SETTINGS_KEY)).toBeNull();
  });
});
