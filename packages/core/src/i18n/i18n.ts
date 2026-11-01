// @skill jgengine-ui
/** A locale tag (e.g. `"en"`, `"es"`, `"ja"`) — a key into a {@link Catalog}. */
export type Locale = string;

import { formatLocaleNumber } from "./localeFormat";

/** Flat message table for one locale: key → template string or plural forms. */
export type Messages = Readonly<Record<string, Message>>;

/** The Unicode plural categories; a language uses only the ones its rules produce. */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/**
 * Templates per plural category. `other` is required; `zero` also matches an exact count of 0 in
 * any language. `ordinal: true` selects with the locale's ordinal rules (1st, 2nd) instead of
 * cardinal ones.
 */
export interface PluralMessage {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
  ordinal?: boolean;
}

/** One message: a `{param}` template, or plural forms chosen by `count`. */
export type Message = string | PluralMessage;

/** All locales' message tables, keyed by locale. */
export type Catalog = Readonly<Record<Locale, Messages>>;

/** Interpolation values for a message template. */
export type TParams = Readonly<Record<string, string | number>>;

/**
 * Replace `{name}` placeholders in `template` with `params[name]`. Unknown placeholders are left
 * intact. With a `locale`, numbers print with that locale's grouping, decimals and digits.
 */
export function interpolate(template: string, params?: TParams, locale?: Locale): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;
    return typeof value === "number" && locale !== undefined ? formatLocaleNumber(locale, value) : String(value);
  });
}

/** The plural category `count` falls in for `locale`, from `Intl.PluralRules`. * @internal
 */
export function pluralCategory(locale: Locale, count: number, type: "cardinal" | "ordinal" = "cardinal"): PluralCategory {
  try {
    return new Intl.PluralRules(locale, { type }).select(count);
  } catch {
    return count === 1 && type === "cardinal" ? "one" : "other";
  }
}

/** The template of `message` for `count`: the exact `zero`, else the locale's category, else `other`. */
export function selectPlural(locale: Locale, message: PluralMessage, count: number): string {
  if (count === 0 && message.zero !== undefined) return message.zero;
  return message[pluralCategory(locale, count, message.ordinal === true ? "ordinal" : "cardinal")] ?? message.other;
}

/** Configuration for {@link createI18n}. */
export interface I18nOptions {
  catalog: Catalog;
  /** Active locale. Must be a key of `catalog` for lookups to resolve there. */
  locale: Locale;
  /** The game's base locale, consulted when a key is missing in the active locale. */
  baseLocale?: Locale;
  /** Called once per locale and key that is missing there (default: one `console.warn`). `t` still answers from the base locale, else the key. */
  onMissing?: (key: string, locale: Locale) => void;
}

/** Runtime translator over a message {@link Catalog} — active locale, lookup with fallback, interpolation, and pluralization. */
export interface I18n {
  locale(): Locale;
  /** Switch the active locale; notifies subscribers when it actually changes. */
  setLocale(locale: Locale): void;
  /** Locales present in the catalog. */
  locales(): readonly Locale[];
  /** The base locale: the configured one, else the locale the translator started on. */
  baseLocale(): Locale;
  /** True when `key` resolves in the active or fallback locale. */
  has(key: string): boolean;
  /** Translate `key`, interpolating `{param}` slots; a plural message uses a numeric `count` param. Returns `key` itself if it resolves nowhere. */
  t(key: string, params?: TParams): string;
  /** Translate a plural message for `count` (available as `{count}`). */
  plural(key: string, count: number, params?: TParams): string;
  subscribe(listener: () => void): () => void;
}

/**
 * Create a translator over a message catalog: active-locale lookup with a base-locale fallback,
 * `{param}` interpolation with locale number formatting, and typed plural messages chosen with
 * `Intl.PluralRules`. Observable (`subscribe`) so React re-renders on `setLocale`; the catalog is
 * caller-owned static data, the locale is the only state.
 *
 * @capability i18n translate a message catalog with base-locale fallback, `{param}` interpolation, and cardinal and ordinal plural messages; observable active-locale switching
 */
export function createI18n(options: I18nOptions): I18n {
  const { catalog } = options;
  const baseLocale = options.baseLocale ?? options.locale;
  let active: Locale = options.locale;
  const listeners = new Set<() => void>();
  const reported = new Set<string>();
  const onMissing =
    options.onMissing ??
    ((key: string, locale: Locale) => {
      console.warn(`[i18n] "${key}" has no ${locale} translation`);
    });

  function report(key: string): void {
    const id = `${active}\u0000${key}`;
    if (reported.has(id)) return;
    reported.add(id);
    onMissing(key, active);
  }

  function resolve(key: string): { message: Message; locale: Locale } | undefined {
    const inActive = catalog[active]?.[key];
    if (inActive !== undefined) return { message: inActive, locale: active };
    if (baseLocale === active) return undefined;
    const inBase = catalog[baseLocale]?.[key];
    return inBase === undefined ? undefined : { message: inBase, locale: baseLocale };
  }

  function translate(key: string, params: TParams | undefined, count: number | undefined): string {
    const found = resolve(key);
    if (found === undefined || found.locale !== active) report(key);
    if (found === undefined) return key;
    const { message, locale } = found;
    if (typeof message === "string") return interpolate(message, params, active);
    const amount = count ?? (typeof params?.["count"] === "number" ? params["count"] : undefined);
    const template = amount === undefined ? message.other : selectPlural(locale, message, amount);
    return interpolate(template, amount === undefined ? params : { ...params, count: amount }, active);
  }

  return {
    locale: () => active,
    setLocale(locale) {
      if (locale === active) return;
      active = locale;
      for (const listener of listeners) listener();
    },
    locales: () => Object.keys(catalog),
    baseLocale: () => baseLocale,
    has: (key) => resolve(key) !== undefined,
    t: (key, params) => translate(key, params, undefined),
    plural: (key, count, params) => translate(key, params, count),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
