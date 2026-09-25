/** A probe game's display title and one-line description from the games repo README table. */
export interface GameReadmeEntry {
  readonly title: string;
  readonly blurb: string;
}

/** Reads the `| Game | Id | Description |` table in JGengine-games' README.md. */
export function parseGameReadme(markdown: string): Record<string, GameReadmeEntry> {
  const entries: Record<string, GameReadmeEntry> = {};
  for (const line of markdown.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 5) continue;
    const id = /^`([a-z0-9-]+)`$/.exec(cells[2] ?? "")?.[1];
    const title = cells[1];
    const blurb = cells[3];
    if (id === undefined || title === undefined || blurb === undefined || title.length === 0) continue;
    entries[id] = { title, blurb };
  }
  return entries;
}
