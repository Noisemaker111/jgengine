// @skill jgengine-ui
/** Reading direction of a locale. */
export type TextDirection = "ltr" | "rtl";

const RTL_LANGUAGES: ReadonlySet<string> = new Set(["ar", "he", "iw", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ckb", "ks", "ku"]);
const RTL_SCRIPTS: ReadonlySet<string> = new Set(["Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm", "Rohg"]);

interface TextInfoLocale {
  getTextInfo?: () => { direction?: string };
  textInfo?: { direction?: string };
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
  const info: TextInfoLocale = parsed;
  if (parsed.script !== undefined) return RTL_SCRIPTS.has(parsed.script) ? "rtl" : "ltr";
  const platform = (info.getTextInfo?.() ?? info.textInfo)?.direction;
  if (platform === "rtl" || platform === "ltr") return platform;
  return RTL_LANGUAGES.has(parsed.language) ? "rtl" : "ltr";
}
