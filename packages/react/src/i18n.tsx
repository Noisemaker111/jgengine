import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import type { I18n, Locale, TParams } from "@jgengine/core/i18n/i18n";

const I18nContext = createContext<I18n | null>(null);

/** Provide an {@link I18n} instance to the tree so `useT`/`useLocale` can read it. */
export function I18nProvider({ i18n, children }: { i18n: I18n; children: ReactNode }): ReactNode {
  return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>;
}

/** Read the current {@link I18n} from context; throws when no {@link I18nProvider} is above. */
export function useI18n(): I18n {
  const i18n = useContext(I18nContext);
  if (i18n === null) throw new Error("useI18n must be used within an <I18nProvider>");
  return i18n;
}

/** Subscribe to the active locale — re-renders on `setLocale`. */
export function useLocale(): Locale {
  const i18n = useI18n();
  return useSyncExternalStore(i18n.subscribe, i18n.locale, i18n.locale);
}

/**
 * Return the translator bound to the current locale; the component re-renders
 * when `setLocale` is called, so returned strings stay live.
 *
 * @capability use-translate live `t(key, params)` translator bound to the active locale, re-rendering on locale change
 */
export function useT(): (key: string, params?: TParams) => string {
  const i18n = useI18n();
  useLocale(); // re-render on locale change
  return i18n.t;
}

/** Return the plural-aware translator bound to the current locale. */
export function usePlural(): (key: string, count: number, params?: TParams) => string {
  const i18n = useI18n();
  useLocale();
  return i18n.plural;
}

/**
 * Render a translated message inline: `<Trans k="hud.score" params={{ value }} />`.
 *
 * @capability trans inline translated-message component bound to the active locale
 */
export function Trans({ k, params }: { k: string; params?: TParams }): ReactNode {
  return useT()(k, params);
}
