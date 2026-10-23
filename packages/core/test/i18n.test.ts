import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  LANGUAGE_NAMES,
  MESSAGES,
  describeDuration,
  en,
  es,
  messagesFor,
  resolveLanguage,
  sanitizeSettings,
} from '../src';

describe('i18n', () => {
  it('español e inglés tienen exactamente las mismas claves y del mismo tipo', () => {
    const esKeys = Object.keys(es).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(esKeys);
    for (const k of esKeys) {
      const a = es[k as keyof typeof es];
      const b = en[k as keyof typeof en];
      expect(typeof b, k).toBe(typeof a);
      if (typeof a === 'function' && typeof b === 'function') expect(b.length, k).toBe(a.length);
      if (typeof a === 'string') expect((b as string).trim().length, k).toBeGreaterThan(0);
    }
  });

  it('ningún texto en inglés se ha quedado en español (sin tildes ni eñes)', () => {
    for (const [k, v] of Object.entries(en)) {
      if (typeof v === 'string') expect(v, k).not.toMatch(/[áéíóúñ]/i);
    }
    expect(en.phaseLabel('break', 2, 4)).toBe('Break 2/4');
    expect(en.summaryCycles(25, 5, 1)).toBe('Cycles · 25/5 · 1 round');
  });

  it('Automático: es* → español; cualquier otro → inglés; sin dato → español', () => {
    expect(resolveLanguage('system', 'es-ES')).toBe('es');
    expect(resolveLanguage('system', 'es')).toBe('es');
    expect(resolveLanguage('system', 'es_419')).toBe('es');
    expect(resolveLanguage('system', 'en-US')).toBe('en');
    expect(resolveLanguage('system', 'de-DE')).toBe('en');
    expect(resolveLanguage('system', 'estonian')).toBe('en');
    expect(resolveLanguage('system', undefined)).toBe('es');
    expect(resolveLanguage('en', 'es-ES')).toBe('en');
    expect(resolveLanguage('es', 'en-GB')).toBe('es');
    expect(messagesFor('system', 'fr-FR')).toBe(MESSAGES.en);
  });

  it('los nombres de idioma van en su propio idioma', () => {
    expect(LANGUAGE_NAMES).toEqual({ es: 'Español', en: 'English' });
  });

  it('describe duraciones en los dos idiomas', () => {
    const MIN = 60_000;
    expect(describeDuration(65 * MIN)).toBe('1 hora y 5 minutos');
    expect(describeDuration(65 * MIN, 'en')).toBe('1 hour and 5 minutes');
    expect(en.duration(1000)).toBe('1 second');
    expect(es.remaining(es.duration(2 * MIN))).toBe('Quedan 2 minutos');
  });

  it('el idioma se guarda con los ajustes y migra a Automático', () => {
    expect(DEFAULT_SETTINGS.language).toBe('system');
    expect(sanitizeSettings({ version: 2, theme: 'dark' }).language).toBe('system');
    expect(sanitizeSettings({ language: 'en' }).language).toBe('en');
    expect(sanitizeSettings({ language: 'fr' }).language).toBe('system');
  });

  it('la ayuda de gestos se marca como vista y se recuerda', () => {
    expect(DEFAULT_SETTINGS.gesturesSeen).toBe(false);
    expect(sanitizeSettings({ version: 2 }).gesturesSeen).toBe(false);
    expect(sanitizeSettings({ gesturesSeen: true }).gesturesSeen).toBe(true);
    expect(sanitizeSettings({ gesturesSeen: 'yes' }).gesturesSeen).toBe(false);
  });
});
