import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import type { I18n, Locale, TParams } from "@jgengine/core/i18n/i18n";
import { readLocale } from "@jgengine/core/i18n/localeSetting";
import { localeDirection } from "@jgengine/core/i18n/textDirection";
import { TextDirectionProvider } from "@jgengine/core/i18n/textDirection.view";
import { useSettingsStore } from "@jgengine/core/settings/settings.view";

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

/**
 * The shell's locale root: keeps `i18n` on the player's locale setting (browser default, base-locale
 * fallback), provides it to the tree, and sets `lang` and `dir` on the document and a wrapper so
 * right-to-left locales flip the HUD.
 *
 * @capability locale-root the player's locale setting drives the translator, `lang` and `dir`
 */
export function LocaleRoot({ i18n, children }: { i18n: I18n; children: ReactNode }): ReactNode {
  const store = useSettingsStore();
  const [, settle] = useState(() => {
    i18n.setLocale(readLocale(store, i18n.locales(), i18n.baseLocale()));
    return 0;
  });
  useEffect(() => {
    const apply = () => i18n.setLocale(readLocale(store, i18n.locales(), i18n.baseLocale()));
    apply();
    settle((n) => n + 1);
    return store.subscribe(apply);
  }, [i18n, store]);
  const locale = useSyncExternalStore(i18n.subscribe, i18n.locale, i18n.locale);
  const direction = localeDirection(locale);
  useEffect(() => {
    const root = document.documentElement;
    const before = { lang: root.lang, dir: root.dir };
    root.lang = locale;
    root.dir = direction;
    return () => {
      root.lang = before.lang;
      root.dir = before.dir;
    };
  }, [locale, direction]);
  return (
    <I18nProvider i18n={i18n}>
      <TextDirectionProvider direction={direction}>
        <div lang={locale} dir={direction} style={{ display: "contents" }}>
          {children}
        </div>
      </TextDirectionProvider>
    </I18nProvider>
  );
}

/** {@link LocaleRoot} for a game with a translator; just the children for one without. */
export function LocaleScope({ i18n, children }: { i18n: I18n | undefined; children: ReactNode }): ReactNode {
  return i18n === undefined ? children : <LocaleRoot i18n={i18n}>{children}</LocaleRoot>;
}
