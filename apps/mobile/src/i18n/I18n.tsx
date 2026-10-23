/**
 * Idioma de la interfaz (1.6): español, inglés o automático.
 *
 * Los textos están en `@reloj/core` (diccionarios tipados `es` / `en`). Aquí
 * solo se decide cuál usar y se reparte con un contexto de React: cualquier
 * componente llama a `useT()` y obtiene los textos del idioma actual.
 *
 * «Automático» sigue al idioma del dispositivo, que leemos con Intl (lo trae
 * Hermes en Android/iOS y el navegador en la web): sin dependencias nativas
 * nuevas. Se vuelve a leer al volver a la app, por si se ha cambiado el
 * idioma del sistema mientras tanto.
 */
import { es, messagesFor, type LanguagePreference, type Messages } from '@reloj/core';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

const I18nContext = createContext<Messages>(es);

/** Idioma del dispositivo («es-ES», «en-US»...), o undefined si no se sabe. */
export function deviceLocale(): string | undefined {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return typeof locale === 'string' && locale !== '' ? locale : undefined;
  } catch {
    return undefined;
  }
}

export function I18nProvider({
  preference,
  children,
}: {
  readonly preference: LanguagePreference;
  readonly children: ReactNode;
}) {
  const [locale, setLocale] = useState(deviceLocale);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setLocale(deviceLocale());
    });
    return () => sub.remove();
  }, []);
  const messages = useMemo(() => messagesFor(preference, locale), [preference, locale]);

  // En la web, el idioma del documento (lectores de pantalla, traductores).
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = messages === es ? 'es' : 'en';
    }
  }, [messages]);

  return <I18nContext.Provider value={messages}>{children}</I18nContext.Provider>;
}

/** Textos del idioma actual. */
export function useT(): Messages {
  return useContext(I18nContext);
}
