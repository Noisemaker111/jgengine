/**
 * The only licences the shared asset library accepts: each allows commercial use and re-hosting, and
 * the CC BY ones only ask for a credit, which the library generates from each entry's data.
 */
export const LIBRARY_LICENSES = ["CC0-1.0", "public-domain", "MIT", "CC-BY-3.0", "CC-BY-4.0"] as const;

/** One accepted library licence (an SPDX id, or `public-domain`). */
export type LibraryLicense = (typeof LIBRARY_LICENSES)[number];

const ACCEPTED: ReadonlySet<string> = new Set(LIBRARY_LICENSES);

/**
 * Whether a value is one of the accepted {@link LIBRARY_LICENSES}.
 *
 * @internal
 */
export function isLibraryLicense(value: unknown): value is LibraryLicense {
  return typeof value === "string" && ACCEPTED.has(value);
}

const SPELLINGS: readonly [RegExp, LibraryLicense][] = [
  [/^(cc0|cc0[\s-]?1\.0|cc0 public domain|creative commons zero|cc-zero)$/, "CC0-1.0"],
  [/^(public[\s-]?domain|pd|no known copyright restrictions)$/, "public-domain"],
  [/^(mit|mit license|the mit license)$/, "MIT"],
  [/^(cc[\s-]?by[\s-]?3\.0|cc-by-3|creative commons attribution 3\.0)$/, "CC-BY-3.0"],
  [/^(cc[\s-]?by|cc[\s-]?by[\s-]?4\.0|cc-by-4|cc attribution|creative commons attribution|creative commons attribution 4\.0)$/, "CC-BY-4.0"],
];

/**
 * Maps a provider's licence label (`"CC0 Public Domain"`, `"CC Attribution"`, `"MIT License"`) to an
 * accepted {@link LibraryLicense}, or `null` for anything else. Non-commercial, share-alike,
 * no-derivatives, editorial, store and custom licences all return `null`: the library refuses them.
 *
 * @capability library-license-gate refuse any asset licence outside CC0, public domain, MIT and CC BY
 */
export function normalizeLibraryLicense(label: string): LibraryLicense | null {
  const key = label.trim().toLowerCase().replace(/\s+/g, " ");
  const exact = label.trim();
  if (isLibraryLicense(exact)) return exact;
  for (const [pattern, license] of SPELLINGS) if (pattern.test(key)) return license;
  return null;
}

/**
 * Providers JGengine never ships, whatever licence a re-upload claims: Kenney (house rule), and
 * Mixamo, Textures.com, Fab and BlenderKit (no redistribution). Matched against author, title and tags.
 */
export const EXCLUDED_PROVIDERS = /\b(kenney|mixamo|textures\.com|blenderkit)\b|(^|[^a-z])fab\.com/i;

/** Whether shipping an asset under this licence obliges a visible credit. */
export function licenseRequiresCredit(license: LibraryLicense): boolean {
  return license === "CC-BY-3.0" || license === "CC-BY-4.0" || license === "MIT";
}

/**
 * The licence's canonical deed or text, for credits that link it.
 *
 * @internal
 */
export function licenseUrl(license: LibraryLicense): string {
  switch (license) {
    case "CC0-1.0":
      return "https://creativecommons.org/publicdomain/zero/1.0/";
    case "public-domain":
      return "https://creativecommons.org/publicdomain/mark/1.0/";
    case "MIT":
      return "https://opensource.org/license/mit";
    case "CC-BY-3.0":
      return "https://creativecommons.org/licenses/by/3.0/";
    case "CC-BY-4.0":
      return "https://creativecommons.org/licenses/by/4.0/";
  }
}
