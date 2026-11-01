import { describe, expect, test } from "bun:test";

import { createSettingsStore } from "../settings/settingsModel";
import { createI18n } from "./i18n";
import { LOCALE_SETTING_ID, localeSettingDef, matchLocale, readLocale, withLocaleSetting } from "./localeSetting";

const SUPPORTED = ["en", "pl", "ar"];

describe("locale setting", () => {
  test("matches an exact tag, then the language, then the base", () => {
    expect(matchLocale(["pl"], SUPPORTED, "en")).toBe("pl");
    expect(matchLocale(["ar-EG", "en"], SUPPORTED, "en")).toBe("ar");
    expect(matchLocale(["fr-CA"], SUPPORTED, "en")).toBe("en");
    expect(matchLocale([], SUPPORTED, "en")).toBe("en");
  });

  test("defaults from the browser and keeps the player's choice", () => {
    const store = createSettingsStore(null);
    expect(readLocale(store, SUPPORTED, "en", ["pl-PL"])).toBe("pl");
    store.set(LOCALE_SETTING_ID, "ar");
    expect(readLocale(store, SUPPORTED, "en", ["pl-PL"])).toBe("ar");
    store.set(LOCALE_SETTING_ID, "xx");
    expect(readLocale(store, SUPPORTED, "en", ["pl-PL"])).toBe("pl");
  });

  test("the setting persists through the settings store's storage", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    createSettingsStore(storage).set(LOCALE_SETTING_ID, "ar");
    expect(readLocale(createSettingsStore(storage), SUPPORTED, "en", ["pl"])).toBe("ar");
  });

  test("the language row lists each locale in its own language", () => {
    const i18n = createI18n({ catalog: { en: {}, pl: {}, ar: {} }, locale: "en" });
    const row = localeSettingDef(i18n, ["pl"]);
    expect(row.default).toBe("pl");
    expect(row.options?.map((o) => o.label)).toEqual(["English", "Polski", "العربية"]);
    expect(withLocaleSetting(undefined, i18n)).toHaveLength(1);
    expect(withLocaleSetting([row], i18n)).toHaveLength(1);
    expect(withLocaleSetting(undefined, createI18n({ catalog: { en: {} }, locale: "en" }))).toHaveLength(0);
    expect(withLocaleSetting(undefined, undefined)).toHaveLength(0);
  });
});
