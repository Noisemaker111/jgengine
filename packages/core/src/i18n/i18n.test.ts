import { describe, expect, test } from "bun:test";

import { createI18n, interpolate, type Catalog } from "./i18n";

const CATALOG: Catalog = {
  en: {
    "hud.score": "Score: {value}",
    greet: "Hello, {name}!",
    "enemies.one": "{count} enemy remaining",
    "enemies.other": "{count} enemies remaining",
    "enemies.zero": "All clear",
  },
  es: {
    "hud.score": "Puntuación: {value}",
    greet: "¡Hola, {name}!",
    // no plural keys → falls back to en
  },
};

function i18n() {
  return createI18n({ catalog: CATALOG, locale: "en", fallbackLocale: "en" });
}

describe("interpolate", () => {
  test("substitutes named params and leaves unknown slots intact", () => {
    expect(interpolate("Hi {name}, you have {n} pts", { name: "Ada", n: 3 })).toBe("Hi Ada, you have 3 pts");
    expect(interpolate("Missing {x}", {})).toBe("Missing {x}");
    expect(interpolate("No params")).toBe("No params");
  });
});

describe("createI18n", () => {
  test("t looks up and interpolates in the active locale", () => {
    const t = i18n();
    expect(t.t("greet", { name: "Ada" })).toBe("Hello, Ada!");
    t.setLocale("es");
    expect(t.t("greet", { name: "Ada" })).toBe("¡Hola, Ada!");
  });

  test("falls back to the fallback locale, then to the key itself", () => {
    const missing: string[] = [];
    const t = createI18n({ catalog: CATALOG, locale: "es", fallbackLocale: "en", onMissing: (k) => missing.push(k) });
    // "enemies.other" is only in en → resolves via fallback
    expect(t.plural("enemies", 5)).toBe("5 enemies remaining");
    // unknown key returns the key and reports it missing
    expect(t.t("nope.key")).toBe("nope.key");
    expect(missing).toContain("nope.key");
  });

  test("plural picks the Intl category with count interpolation", () => {
    const t = i18n();
    expect(t.plural("enemies", 1)).toBe("1 enemy remaining");
    expect(t.plural("enemies", 3)).toBe("3 enemies remaining");
    expect(t.plural("enemies", 0)).toBe("0 enemies remaining"); // en: 0 → "other"
  });

  test("has reflects active + fallback resolution; locales lists the catalog", () => {
    const t = i18n();
    expect(t.has("greet")).toBe(true);
    expect(t.has("absent")).toBe(false);
    expect(t.locales().sort()).toEqual(["en", "es"]);
  });

  test("setLocale notifies subscribers only on an actual change", () => {
    const t = i18n();
    let hits = 0;
    const off = t.subscribe(() => { hits += 1; });
    t.setLocale("es");
    t.setLocale("es"); // no-op, same locale
    off();
    t.setLocale("en");
    expect(hits).toBe(1);
    expect(t.locale()).toBe("en");
  });
});
