import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { GAME_ID_PATTERN, resolveGameSettings, type GameSettings } from "../src/project/gameMeta";

export interface GameListEntry extends GameSettings {
  hasConfig: boolean;
  hasPackage: boolean;
  thumbnail: string | null;
  hasEditorScene: boolean;
}

export interface ListGamesOptions {
  gamesDir: string;
  thumbnailCandidates?: readonly string[];
}

const DEFAULT_THUMB_NAMES = [
  "public/thumbnail.png",
  "public/icon.png",
  "public/cover.png",
  "icon.png",
] as const;

function resolveThumbnail(gameDir: string, candidates: readonly string[]): string | null {
  for (const relative of candidates) {
    const full = join(gameDir, relative);
    if (existsSync(full) && statSync(full).isFile()) return relative.replaceAll("\\", "/");
  }
  return null;
}

export function listGames(options: ListGamesOptions): GameListEntry[] {
  const { gamesDir } = options;
  const thumbNames = options.thumbnailCandidates ?? DEFAULT_THUMB_NAMES;
  if (!existsSync(gamesDir)) return [];

  const entries: GameListEntry[] = [];
  for (const name of readdirSync(gamesDir)) {
    if (!GAME_ID_PATTERN.test(name)) continue;
    const gameDir = join(gamesDir, name);
    if (!statSync(gameDir).isDirectory()) continue;
    const packagePath = join(gameDir, "package.json");
    if (!existsSync(packagePath)) continue;

    const configPath = join(gameDir, "src", "game.config.ts");
    const hasConfig = existsSync(configPath);
    const configSource = hasConfig ? readFileSync(configPath, "utf8") : null;
    const packageSource = readFileSync(packagePath, "utf8");
    const settings = resolveGameSettings({
      id: name,
      configSource,
      packageSource,
    });

    entries.push({
      ...settings,
      hasConfig,
      hasPackage: true,
      thumbnail: resolveThumbnail(gameDir, thumbNames),
      hasEditorScene: existsSync(join(gameDir, "src", "editor.scene.json")),
    });
  }

  return entries.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function readGameSettings(gamesDir: string, id: string): GameListEntry | null {
  if (!GAME_ID_PATTERN.test(id)) return null;
  const found = listGames({ gamesDir }).find((entry) => entry.id === id);
  return found ?? null;
}
