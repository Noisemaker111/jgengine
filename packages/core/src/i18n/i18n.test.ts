import { describe, expect, test } from "bun:test";

import { createI18n, interpolate, pluralCategory, selectPlural, type Catalog } from "./i18n";

const CATALOG: Catalog = {
  en: {
    "hud.score": "Score: {value}",
    greet: "Hello, {name}!",
    enemies: { zero: "All clear", one: "{count} enemy remaining", other: "{count} enemies remaining" },
    place: { ordinal: true, one: "{count}st", two: "{count}nd", few: "{count}rd", other: "{count}th" },
  },
  pl: {
    enemies: { one: "{count} wróg", few: "{count} wrogowie", many: "{count} wrogów", other: "{count} wroga" },
  },
  ar: {
    enemies: { zero: "لا أعداء", one: "عدو واحد", two: "عدوان", few: "{count} أعداء", many: "{count} عدوًا", other: "{count} عدو" },
  },
  ja: {
    enemies: { other: "敵 {count} 体" },
  },
  es: {
    "hud.score": "Puntuación: {value}",
    greet: "¡Hola, {name}!",
  },
};

function i18n(locale = "en") {
  return createI18n({ catalog: CATALOG, locale, baseLocale: "en" });
}

describe("interpolate", () => {
  test("substitutes named params and leaves unknown slots intact", () => {
    expect(interpolate("Hi {name}, you have {n} pts", { name: "Ada", n: 3 })).toBe("Hi Ada, you have 3 pts");
    expect(interpolate("Missing {x}", {})).toBe("Missing {x}");
    expect(interpolate("No params")).toBe("No params");
  });

  test("numbers print with the locale's grouping when a locale is given", () => {
    expect(interpolate("{n}", { n: 1234567.5 }, "en")).toBe("1,234,567.5");
    expect(interpolate("{n}", { n: 1234567.5 }, "de")).toBe("1.234.567,5");
  });
});

describe("plural categories", () => {
  test("English: one and other, an exact zero form", () => {
    const t = i18n();
    expect(t.plural("enemies", 1)).toBe("1 enemy remaining");
    expect(t.plural("enemies", 3)).toBe("3 enemies remaining");
    expect(t.plural("enemies", 0)).toBe("All clear");
  });

  test("Polish: one, few, many, other", () => {
    const t = i18n("pl");
    expect(t.plural("enemies", 1)).toBe("1 wróg");
    expect(t.plural("enemies", 3)).toBe("3 wrogowie");
    expect(t.plural("enemies", 5)).toBe("5 wrogów");
    expect(t.plural("enemies", 22)).toBe("22 wrogowie");
    expect(t.plural("enemies", 1.5)).toBe("1,5 wroga");
  });

  test("Arabic: zero, one, two, few, many, other", () => {
    expect(pluralCategory("ar", 0)).toBe("zero");
    expect(pluralCategory("ar", 1)).toBe("one");
    expect(pluralCategory("ar", 2)).toBe("two");
    expect(pluralCategory("ar", 5)).toBe("few");
    expect(pluralCategory("ar", 11)).toBe("many");
    expect(pluralCategory("ar", 100)).toBe("other");
    const t = i18n("ar");
    expect(t.plural("enemies", 2)).toBe("عدوان");
    expect(t.plural("enemies", 0)).toBe("لا أعداء");
  });

  test("Japanese has one category", () => {
    const t = i18n("ja");
    expect(pluralCategory("ja", 1)).toBe("other");
    expect(t.plural("enemies", 1)).toBe("敵 1 体");
    expect(t.plural("enemies", 7)).toBe("敵 7 体");
  });

  test("ordinal messages use the ordinal rules", () => {
    const t = i18n();
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map((n) => t.plural("place", n))).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st",
    ]);
  });

  test("a form the language lacks falls back to other", () => {
    expect(selectPlural("en", { other: "many things" }, 1)).toBe("many things");
  });

  test("t on a plural message reads a numeric count param", () => {
    expect(i18n().t("enemies", { count: 1 })).toBe("1 enemy remaining");
  });
});

describe("createI18n", () => {
  test("t looks up and interpolates in the active locale", () => {
    const t = i18n();
    expect(t.t("greet", { name: "Ada" })).toBe("Hello, Ada!");
    t.setLocale("es");
    expect(t.t("greet", { name: "Ada" })).toBe("¡Hola, Ada!");
  });

  test("a missing key answers from the base locale and is reported once", () => {
    const missing: string[] = [];
    const t = createI18n({ catalog: CATALOG, locale: "es", baseLocale: "en", onMissing: (k, l) => missing.push(`${l}:${k}`) });
    expect(t.plural("enemies", 5)).toBe("5 enemies remaining");
    expect(t.plural("enemies", 1)).toBe("1 enemy remaining");
    expect(t.t("nope.key")).toBe("nope.key");
    expect(t.t("nope.key")).toBe("nope.key");
    expect(missing).toEqual(["es:enemies", "es:nope.key"]);
  });

  test("has reflects active + base resolution; locales lists the catalog", () => {
    const t = i18n();
    expect(t.has("greet")).toBe(true);
    expect(t.has("absent")).toBe(false);
    expect(t.baseLocale()).toBe("en");
    expect(t.locales().sort()).toEqual(["ar", "en", "es", "ja", "pl"]);
  });

  test("setLocale notifies subscribers only on an actual change", () => {
    const t = i18n();
    let hits = 0;
    const off = t.subscribe(() => { hits += 1; });
    t.setLocale("es");
    t.setLocale("es");
    off();
    t.setLocale("en");
    expect(hits).toBe(1);
    expect(t.locale()).toBe("en");
  });
});
