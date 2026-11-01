// @skill jgengine-ui
/** Reading direction of a locale. */
export type TextDirection = "ltr" | "rtl";

const RTL_LANGUAGES: ReadonlySet<string> = new Set(["ar", "he", "iw", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ckb", "ks", "ku"]);
const RTL_SCRIPTS: ReadonlySet<string> = new Set(["Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm", "Rohg"]);

function platformDirection(locale: Intl.Locale): unknown {
  const getter: unknown = Reflect.get(locale, "getTextInfo");
  const info: unknown = typeof getter === "function" ? Reflect.apply(getter, locale, []) : Reflect.get(locale, "textInfo");
  return typeof info === "object" && info !== null ? Reflect.get(info, "direction") : undefined;
}

/**
 * Reading direction of a locale tag (`"ar"`, `"he-IL"`, `"ur-PK"` are `rtl`). An explicit script
 * subtag decides, then the platform's `Intl.Locale` text info, then the language; an unparseable
 * tag is `ltr`.
 *
 * @capability text-direction left-to-right or right-to-left for a locale tag, from the platform's Intl data
 */
export function localeDirection(locale: string): TextDirection {
  let parsed: Intl.Locale;
  try {
    parsed = new Intl.Locale(locale);
  } catch {
    return "ltr";
  }
  if (parsed.script !== undefined) return RTL_SCRIPTS.has(parsed.script) ? "rtl" : "ltr";
  const platform = platformDirection(parsed);
  if (platform === "rtl" || platform === "ltr") return platform;
  return RTL_LANGUAGES.has(parsed.language) ? "rtl" : "ltr";
}
