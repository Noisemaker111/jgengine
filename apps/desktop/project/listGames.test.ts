import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { listGames, readGameSettings } from "./listGames";

const roots: string[] = [];

function makeGamesRoot(
  games: Record<string, { config?: string; pkg?: string | false; thumb?: boolean }>,
): string {
  const root = mkdtempSync(join(tmpdir(), "jg-project-list-"));
  roots.push(root);
  for (const [id, files] of Object.entries(games)) {
    const gameDir = join(root, id);
    const src = join(gameDir, "src");
    mkdirSync(src, { recursive: true });
    if (files.pkg !== false) {
      writeFileSync(
        join(gameDir, "package.json"),
        files.pkg ?? JSON.stringify({ name: `@games/${id}`, private: true }),
      );
    }
    if (files.config !== undefined) {
      writeFileSync(join(src, "game.config.ts"), files.config);
    }
    if (files.thumb) {
      mkdirSync(join(gameDir, "public"), { recursive: true });
      writeFileSync(join(gameDir, "public", "thumbnail.png"), "png");
    }
  }
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("listGames", () => {
  test("lists package games with display names and thumbnails", () => {
    const gamesDir = makeGamesRoot({
      "tower-guard": {
        config: `export const game = defineGame({ name: "Tower Guard", world });\n`,
        thumb: true,
      },
      starhome: {
        config: `export const game = defineGame({ name: "Starhome", world });\n`,
      },
      "not-a-game": { pkg: false },
    });
    writeFileSync(join(gamesDir, "README.md"), "skip");
    const listed = listGames({ gamesDir });
    expect(listed.map((g) => g.id).sort()).toEqual(["starhome", "tower-guard"]);
    expect(listed.find((g) => g.id === "tower-guard")?.displayName).toBe("Tower Guard");
    expect(listed.find((g) => g.id === "tower-guard")?.thumbnail).toBe("public/thumbnail.png");
    expect(listed.find((g) => g.id === "starhome")?.thumbnail).toBeNull();
  });

  test("readGameSettings returns null for unknown ids", () => {
    const gamesDir = makeGamesRoot({
      demo: { config: `export const game = defineGame({ name: "Demo", world });\n` },
    });
    expect(readGameSettings(gamesDir, "demo")?.displayName).toBe("Demo");
    expect(readGameSettings(gamesDir, "missing")).toBeNull();
    expect(readGameSettings(gamesDir, "../evil")).toBeNull();
  });
});
