'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fr, type Dictionary } from './fr';
import { en } from './en';

type Locale = 'fr' | 'en';
const dictionaries: Record<Locale, Dictionary> = { fr, en };

interface I18nContextValue {
  locale: Locale;
  dict: Dictionary;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'fr',
  dict: fr,
  setLocale: () => undefined,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('fr');

  useEffect(() => {
    const stored = document.cookie.match(/(?:^|;\s*)yurei_locale=(fr|en)/)?.[1] as Locale | undefined;
    if (stored) setLocaleState(stored);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.cookie = `yurei_locale=${next}; path=/; max-age=${3600 * 24 * 365}; samesite=lax`;
  }, []);

  const value = useMemo(
    () => ({ locale, dict: dictionaries[locale], setLocale }),
    [locale, setLocale],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

/** Raccourci : `const t = useT(); t.nav.dashboard` */
export function useT(): Dictionary {
  return useContext(I18nContext).dict;
}
