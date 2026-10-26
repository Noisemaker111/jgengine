const STOPWORDS = new Set(["a", "an", "the", "to", "for", "of", "with", "and", "or", "in", "on", "my", "i", "want", "where", "is", "lives"]);

/** @internal Strip a plural/gerund/past suffix so "targeting", "targets" and "target" compare equal. */
export function stem(word: string): string {
  for (const suffix of ["ing", "es", "ed", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length);
  }
  return word;
}

/** @internal Every word in a text: raw alphanumeric runs plus their camelCase parts, lowercased. */
export function rowWords(text: string): Set<string> {
  const words = new Set<string>();
  for (const run of text.split(/[^A-Za-z0-9]+/)) {
    if (run === "") continue;
    words.add(run.toLowerCase());
    for (const part of run.split(/(?<=[a-z0-9])(?=[A-Z])/)) words.add(part.toLowerCase());
  }
  return words;
}

/**
 * @internal A query token hits a word when their stems match, or when a 4+ letter stem prefixes the
 * word. Whole-word matching keeps "aim" off "claim" and "car" off "carry"; a token with punctuation
 * (an import path) falls back to substring.
 */
export function tokenHits(token: string, words: ReadonlySet<string>, raw: string): boolean {
  if (/[^a-z0-9]/.test(token)) return raw.includes(token);
  const target = stem(token);
  for (const word of words) {
    if (word === token || stem(word) === target) return true;
    if (target.length >= 4 && word.startsWith(target)) return true;
  }
  return false;
}

/** @internal The lowercase words of a query, stopwords dropped. */
export function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token !== "" && !STOPWORDS.has(token));
}
