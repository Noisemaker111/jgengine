// Shared by the site's Vite config and its prerender (scripts/prerender.ts): the engine source
// aliases and the build-time games index every page reads.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Alias, Plugin } from "vite";

import { parseGameReadme, parseGameSeed } from "./src/lib/gameReadme";
import { DEMO_PARTS } from "./src/live/demoParts";

const gamesDir = fileURLToPath(new URL("../../games", import.meta.url));
const githubSrc = fileURLToPath(new URL("../../packages/github/src", import.meta.url));
const coreSrc = fileURLToPath(new URL("../../packages/core/src", import.meta.url));
const gameThumbsDir = fileURLToPath(new URL("./public/covers", import.meta.url));

/** `@jgengine/github` and `@jgengine/core` resolve to source; CI's web-build job never builds package dist. */
export const siteAliases: Alias[] = [
  { find: /^@jgengine\/github$/, replacement: `${githubSrc}/index.ts` },
  { find: /^@jgengine\/github\/(.*)$/, replacement: `${githubSrc}/$1` },
  { find: /^@jgengine\/core$/, replacement: `${coreSrc}/index.ts` },
  { find: /^@jgengine\/core\/(.*)$/, replacement: `${coreSrc}/$1` },
];

const GAMES_INDEX_ID = "virtual:jgengine-games";

/**
 * Parses a game's `export const credit = …` from its game.config.ts source.
 * Mirrors the `GameCredit` shape and the desktop project surface
 * (apps/desktop/src/project/gameMeta.ts) — the game's config is the single
 * source of truth for its attribution, not a hand-maintained web registry.
 */
const CREDIT_EXPORT_RE =
  /export\s+const\s+credit\s*=\s*(\{[\s\S]*?\n\}|\{[^}]*\}|["'`][^"'`]+["'`])\s*;?/;

const parseGameCredit = (
  configSource: string,
): { text: string; url?: string; handle?: string } | null => {
  const match = configSource.match(CREDIT_EXPORT_RE);
  const raw = match?.[1]?.trim();
  if (raw === undefined) return null;
  if (/^["'`]/.test(raw)) {
    const text = raw.slice(1, -1).trim();
    return text.length > 0 ? { text } : null;
  }
  const text = raw.match(/(?:text|label|name)\s*:\s*["'`]([^"'`]+)["'`]/)?.[1]?.trim();
  if (text === undefined || text.length === 0) return null;
  const url = raw.match(/url\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
  const handle = raw.match(/handle\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
  return { text, ...(url !== undefined ? { url } : {}), ...(handle !== undefined ? { handle } : {}) };
};

/** The site's live demos whose engine part a game's source (or editor scene) uses. */
const gameDemoParts = (srcDir: string): string[] => {
  const files = readdirSync(srcDir, { recursive: true, encoding: "utf8" }).filter((file) => /\.(tsx?|json)$/.test(file));
  const found = new Set<string>();
  for (const file of files) {
    const text = readFileSync(join(srcDir, file), "utf8");
    for (const part of DEMO_PARTS) if (!found.has(part.key) && part.source.test(text)) found.add(part.key);
    if (found.size === DEMO_PARTS.length) break;
  }
  return DEMO_PARTS.filter((part) => found.has(part.key)).map((part) => part.key);
};

/** Every game the site lists, plays and puts in the sitemap: each `games/<id>` with a `src/index.tsx`. */
export const listGameIds = (): string[] =>
  readdirSync(gamesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(gamesDir, entry.name, "src/index.tsx")))
    .map((entry) => entry.name)
    .sort();

/** Exposes the games/* ids, per-game credit and the demoed engine parts each game uses to routes as `virtual:jgengine-games`, resolved at build time. */
export const gamesIndexPlugin = (): Plugin => ({
  name: "jgengine-games-index",
  resolveId(id) {
    if (id === GAMES_INDEX_ID) return `\0${GAMES_INDEX_ID}`;
    return null;
  },
  load(id) {
    if (id !== `\0${GAMES_INDEX_ID}`) return;
    const ids = listGameIds();
    const credits: Record<string, { text: string; url?: string; handle?: string }> = {};
    for (const gameId of ids) {
      const configPath = join(gamesDir, gameId, "src/game.config.ts");
      if (!existsSync(configPath)) continue;
      const credit = parseGameCredit(readFileSync(configPath, "utf8"));
      if (credit !== null) credits[gameId] = credit;
    }
    const readmePath = join(gamesDir, "README.md");
    const meta = existsSync(readmePath) ? parseGameReadme(readFileSync(readmePath, "utf8")) : {};
    const thumbs = ids.filter((gameId) => existsSync(join(gameThumbsDir, `${gameId}.webp`)));
    const seeds: Record<string, string> = {};
    for (const gameId of ids) {
      const gameReadme = join(gamesDir, gameId, "README.md");
      const seed = existsSync(gameReadme) ? parseGameSeed(readFileSync(gameReadme, "utf8")) : null;
      if (seed !== null) seeds[gameId] = seed;
    }
    const parts: Record<string, string[]> = {};
    for (const gameId of ids) parts[gameId] = gameDemoParts(join(gamesDir, gameId, "src"));
    return `export const GAME_IDS = ${JSON.stringify(ids)};
export const GAME_PARTS = ${JSON.stringify(parts)};
export const GAME_CREDITS = ${JSON.stringify(credits)};
export const GAME_META = ${JSON.stringify(meta)};
export const GAME_THUMBS = ${JSON.stringify(thumbs)};
export const GAME_SEEDS = ${JSON.stringify(seeds)};`;
  },
});

