/** Small text helpers every kind's reader uses. */
import type { BeatWord } from "../template/common/src/game/ideaShape";

export const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);

export const hash = (text: string): number => [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);

export const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Hits of `wanted` in `said`; a multi-word phrase counts double when it appears in order. */
export function score(said: readonly string[], wanted: readonly string[]): number {
  const joined = ` ${said.join(" ")} `;
  let hits = 0;
  for (const word of wanted) {
    if (word.includes(" ")) {
      if (joined.includes(` ${word} `)) hits += 2;
    } else if (said.includes(word)) hits += 1;
  }
  return hits;
}

/** The theme whose words the idea hits most; ties go to the first listed. */
export function pickTheme<T extends { words: readonly string[] }>(said: readonly string[], themes: readonly T[]): T {
  let best = themes[0]!;
  let bestHits = -1;
  for (const theme of themes) {
    const hits = score(said, theme.words);
    if (hits > bestHits) {
      best = theme;
      bestHits = hits;
    }
  }
  return best;
}

export function nameFor(text: string, names: readonly string[], options: { name?: string }): { name: string; id: string; spec: string } {
  const name = options.name ?? names[hash(text) % names.length]!;
  const id = slug(name);
  return { name, id, spec: id.replace(/-/g, "_") };
}

/** Beats from story lines and goals, one each; the last goal always ends the story. */
export function beats(story: readonly { title: string; pitch: string }[], goals: readonly Omit<BeatWord, "id" | "title" | "pitch">[]): BeatWord[] {
  const lines = story.slice(0, goals.length);
  return lines.map((line, index) => {
    const goal = index === lines.length - 1 ? goals[goals.length - 1]! : goals[index]!;
    return { id: `beat${index + 1}`, title: line.title, pitch: line.pitch, ...goal };
  });
}

export const flowAssertText = (text: string) => `/${text.replace(/[.*+?^${}()|[\]\/]/g, "\$&")}/i.test(document.body.innerText)`;
