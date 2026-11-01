// @skill jgengine-ui
import type { GameSettingDef, SettingOption, SettingsStore } from "../settings/settingsModel";
import type { I18n, Locale } from "./i18n";

/** The persisted settings id of the player's locale. */
export const LOCALE_SETTING_ID = "language.locale";

/** The browser's preferred locales, most wanted first; empty outside a browser. */
export function browserLocales(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  const languages: readonly string[] | undefined = navigator.languages;
  if (languages !== undefined && languages.length > 0) return languages;
  return typeof navigator.language !== "string" || navigator.language === "" ? [] : [navigator.language];
}

/**
 * The supported locale that best matches the requested tags: an exact tag, else the same language
 * (`"pt-BR"` asks for `"pt"`), else `base`.
 */
export function matchLocale(requested: readonly string[], supported: readonly Locale[], base: Locale): Locale {
  for (const tag of requested) {
    const wanted = tag.toLowerCase();
    const language = wanted.split("-")[0];
    const found =
      supported.find((entry) => entry.toLowerCase() === wanted) ??
      supported.find((entry) => entry.toLowerCase().split("-")[0] === language);
    if (found !== undefined) return found;
  }
  return base;
}

/** The locale the player has chosen, else the browser's best match, else `base`. */
export function readLocale(store: SettingsStore, supported: readonly Locale[], base: Locale, requested: readonly string[] = browserLocales()): Locale {
  const stored = store.get(LOCALE_SETTING_ID, "");
  if (typeof stored === "string" && supported.includes(stored)) return stored;
  return matchLocale(requested, supported, base);
}

/** Each locale labelled in its own language ("Deutsch", "日本語"). */
export function localeOptions(supported: readonly Locale[]): SettingOption[] {
  return supported.map((value) => {
    let label = value;
    try {
      label = new Intl.DisplayNames([value], { type: "language" }).of(value) ?? value;
    } catch {
      label = value;
    }
    return { value, label: label.charAt(0).toLocaleUpperCase(value) + label.slice(1) };
  });
}

/**
 * The language row for `defineGame({ chrome: { settings: { extra } } })`; the shell adds it by itself
 * for a game that sets `i18n`. Defaults to the browser's best match.
 */
export function localeSettingDef(i18n: I18n, requested: readonly string[] = browserLocales()): GameSettingDef {
  const supported = i18n.locales();
  return {
    id: LOCALE_SETTING_ID,
    label: "Language",
    category: "gameplay",
    kind: "select",
    default: matchLocale(requested, supported, i18n.baseLocale()),
    options: localeOptions(supported),
  };
}

/** `extra` with the Language row added when the game has a translator with more than one locale. */
export function withLocaleSetting(extra: readonly GameSettingDef[] | undefined, i18n: I18n | undefined): readonly GameSettingDef[] {
  const rows = extra ?? [];
  if (i18n === undefined || i18n.locales().length < 2 || rows.some((row) => row.id === LOCALE_SETTING_ID)) return rows;
  return [...rows, localeSettingDef(i18n)];
}
