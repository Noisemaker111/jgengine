/** A locale tag (e.g. `"en"`, `"es"`, `"ja"`) — a key into a {@link Catalog}. */
export type Locale = string;

/** Flat message table for one locale: key → template string with `{param}` slots. */
export type Messages = Readonly<Record<string, string>>;

/** All locales' message tables, keyed by locale. */
export type Catalog = Readonly<Record<Locale, Messages>>;

/** Interpolation values for a message template. */
export type TParams = Readonly<Record<string, string | number>>;

/**
 * Replace `{name}` placeholders in `template` with `params[name]`. Unknown
 * placeholders are left intact. Pure and locale-independent.
 */
export function interpolate(template: string, params?: TParams): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

function pluralCategory(locale: Locale, count: number): string {
  try {
    return new Intl.PluralRules(locale).select(count);
  } catch {
    return count === 1 ? "one" : "other";
  }
}

/** Configuration for {@link createI18n}. */
export interface I18nOptions {
  catalog: Catalog;
  /** Active locale. Must be a key of `catalog` for lookups to resolve there. */
  locale: Locale;
  /** Locale consulted when a key is missing in the active locale. */
  fallbackLocale?: Locale;
  /** Invoked when a key resolves nowhere (dev warnings/telemetry); `t` still returns the key. */
  onMissing?: (key: string, locale: Locale) => void;
}

/** Runtime translator over a message {@link Catalog} — active locale, lookup with fallback, interpolation, and pluralization. */
export interface I18n {
  locale(): Locale;
  /** Switch the active locale; notifies subscribers when it actually changes. */
  setLocale(locale: Locale): void;
  /** Locales present in the catalog. */
  locales(): readonly Locale[];
  /** True when `key` resolves in the active or fallback locale. */
  has(key: string): boolean;
  /** Translate `key`, interpolating `{param}` slots; returns `key` itself if it resolves nowhere. */
  t(key: string, params?: TParams): string;
  /**
   * Plural-aware translate: picks `${key}.${category}` for the active locale's
   * Intl plural category (falling back to `${key}.other`, then `key`), with
   * `count` available as the `{count}` interpolation param.
   */
  plural(key: string, count: number, params?: TParams): string;
  subscribe(listener: () => void): () => void;
}

/**
 * Create a translator over a message catalog: active-locale lookup with a
 * fallback-locale chain, `{param}` interpolation, and `Intl.PluralRules`-based
 * pluralization. Observable (`subscribe`) so React re-renders on `setLocale`;
 * the catalog is caller-owned static data, the locale is the only state.
 *
 * @capability i18n translate a message catalog with fallback-locale lookup, `{param}` interpolation, and Intl pluralization; observable active-locale switching
 */
export function createI18n(options: I18nOptions): I18n {
  const { catalog, fallbackLocale, onMissing } = options;
  let active: Locale = options.locale;
  const listeners = new Set<() => void>();

  function resolve(key: string): string | undefined {
    const inActive = catalog[active]?.[key];
    if (inActive !== undefined) return inActive;
    if (fallbackLocale !== undefined && fallbackLocale !== active) return catalog[fallbackLocale]?.[key];
    return undefined;
  }

  const i18n: I18n = {
    locale() {
      return active;
    },
    setLocale(locale) {
      if (locale === active) return;
      active = locale;
      for (const listener of listeners) listener();
    },
    locales() {
      return Object.keys(catalog);
    },
    has(key) {
      return resolve(key) !== undefined;
    },
    t(key, params) {
      const template = resolve(key);
      if (template === undefined) {
        onMissing?.(key, active);
        return key;
      }
      return interpolate(template, params);
    },
    plural(key, count, params) {
      const category = pluralCategory(active, count);
      const template = resolve(`${key}.${category}`) ?? resolve(`${key}.other`) ?? resolve(key);
      const merged: TParams = { count, ...(params ?? {}) };
      if (template === undefined) {
        onMissing?.(`${key}.${category}`, active);
        return key;
      }
      return interpolate(template, merged);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return i18n;
}
