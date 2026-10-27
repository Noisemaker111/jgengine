/**
 * Rank names by how close they are to what a step asked for, so a failed click, probe check or
 * flow call names the controls, keys or calls it probably meant instead of only saying "not found".
 */

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitute = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitute));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

function words(text: string): string[] {
  return text.split(/[^a-z0-9]+/).filter((word) => word.length > 0);
}

/** 0 for the same name, rising towards 1 (and past it) as the names share less. */
function distance(wanted: string, name: string): number {
  // One name inside the other is close only when the inner one is a real part of it, not a hotkey letter.
  const [shorter, longer] = name.length < wanted.length ? [name, wanted] : [wanted, name];
  if (longer.includes(shorter) && shorter.length >= 3 && shorter.length * 2.5 >= longer.length) return 0.1;
  const edit = editDistance(wanted, name) / Math.max(wanted.length, name.length);
  const wantedWords = words(wanted);
  const nameWords = new Set(words(name));
  const shared = wantedWords.filter((word) => nameWords.has(word)).length;
  return edit - (wantedWords.length === 0 ? 0 : 0.5 * (shared / wantedWords.length));
}

/**
 * Up to `limit` of `names` closest to `wanted`, best first, ignoring case and dropping names too
 * far away to be a likely meaning. Duplicates and empty names are skipped.
 */
export function closestMatches(wanted: string, names: Iterable<string>, limit = 3): string[] {
  const needle = wanted.trim().toLowerCase();
  const seen = new Set<string>();
  const ranked: { name: string; score: number }[] = [];
  for (const raw of names) {
    const name = raw.replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    const score = distance(needle, key);
    if (score <= 0.5) ranked.push({ name, score });
  }
  ranked.sort((a, b) => a.score - b.score || a.name.length - b.name.length);
  return ranked.slice(0, limit).map((entry) => entry.name);
}

/** `; closest: "a", "b"` for an error message, or "" when nothing is close. */
export function closestHint(wanted: string, names: Iterable<string>, what: string): string {
  const close = closestMatches(wanted, names);
  return close.length === 0 ? "" : `; closest ${what}: ${close.map((name) => JSON.stringify(name)).join(", ")}`;
}
