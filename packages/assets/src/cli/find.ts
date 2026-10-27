import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assetStoreRoot, dirHasEntries, provisionJobs, type PullJob } from "../assetStore";
import { CONFIDENT_SCORE, findAssets, type AssetFindResult, type FoundAsset, type GameModelFile } from "../findAssets";
import { resolveDefaultOutputRoot } from "./paths";

const USAGE = [
  "usage: assets find <name> [<name>...] [--list <file.json>] [--game <dir>] [--provision] [--limit N]",
  "",
  "Prints one JSON document: for each name, the best matches with licence, the URL the game loads,",
  "whether it is on disk, and free sources to search when nothing here fits.",
  "  --list <file.json>  more names: a JSON array of strings or { \"query\": ..., \"pick\": <match id> }",
  "  --game <dir>        check and serve paths for this game (its public/ folder)",
  "  --provision         put each request's pick into --game: the top match when it scores",
  `                      ${CONFIDENT_SCORE}+, or the match id the list names as \"pick\"`,
  "  --limit N           matches per name (default 5)",
].join("\n");

/** One request: a name, and optionally the match id to provision instead of the top one. */
export interface FindRequest {
  query: string;
  pick?: string;
}

/** What `--provision` did: packs and library models served to the game, files copied from other games. */
export interface FindProvisionReport {
  linked: string[];
  pulled: string[];
  copied: string[];
  failed: string[];
  /** Requests with no pick: no confident match and no `pick` named. */
  skipped: string[];
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

/**
 * Parse `--list` contents: a JSON array of names or `{ query, pick? }` objects.
 * @internal
 */
export function parseFindList(text: string): FindRequest[] {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("--list must hold a JSON array");
  return data.map((item, index) => {
    if (typeof item === "string" && item.trim() !== "") return { query: item.trim() };
    if (typeof item === "object" && item !== null && "query" in item && typeof item.query === "string" && item.query.trim() !== "") {
      const pick = "pick" in item ? item.pick : undefined;
      if (pick !== undefined && typeof pick !== "string") throw new Error(`--list item ${index}: "pick" must be a match id string`);
      return pick === undefined ? { query: item.query.trim() } : { query: item.query.trim(), pick };
    }
    throw new Error(`--list item ${index} must be a name or { "query": "...", "pick"?: "..." }`);
  });
}

/**
 * The jgengine checkout `from` sits in (a folder with `games/` and `packages/assets/`), or null.
 * @internal
 */
export function checkoutRoot(from: string): string | null {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, "games")) && existsSync(join(dir, "packages", "assets", "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function modelFilesUnder(dir: string, rel: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) modelFilesUnder(join(dir, entry.name), `${rel}/${entry.name}`, out);
    else if (/\.(glb|gltf)$/i.test(entry.name)) out.push(`${rel}/${entry.name}`);
  }
}

/** Model files games ship under `public/models/imported/`: every game in the checkout, else just this one. */
function shippedGameFiles(root: string | null, gameDir: string | null): GameModelFile[] {
  const games = root !== null
    ? readdirSync(join(root, "games")).map((name) => join(root, "games", name)).filter((dir) => existsSync(join(dir, "public")))
    : gameDir === null ? [] : [gameDir];
  const files: GameModelFile[] = [];
  for (const dir of games) {
    const rels: string[] = [];
    modelFilesUnder(join(dir, "public", "models", "imported"), "models/imported", rels);
    for (const rel of rels) files.push({ game: basename(dir), rel });
  }
  return files;
}

function present(path: string): boolean {
  try {
    return statSync(path).isDirectory() ? dirHasEntries(path) : true;
  } catch {
    return false;
  }
}

/**
 * The match a request provisions: the one it names, else the top match when it is confident.
 * @internal
 */
export function pickOf(request: FindRequest, result: AssetFindResult): FoundAsset | null {
  if (request.pick !== undefined) return result.matches.find((match) => match.id === request.pick) ?? null;
  const top = result.matches[0];
  return top !== undefined && top.score >= CONFIDENT_SCORE ? top : null;
}

function jobOf(match: FoundAsset): PullJob | null {
  switch (match.kind) {
    case "model":
    case "pack":
      return { target: match.source, dir: `models/${match.source}` };
    case "library":
      return match.pull === null ? null : { target: match.pull, dir: `models/library/${match.id}` };
    case "game-file":
      return null;
  }
}

const pullScript = fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "./pull.ts" : "./pull.js", import.meta.url));

/** `assets pull <target> --dir <outRoot>` in a child whose output goes to stderr, keeping stdout one JSON document. */
function spawnPull(target: string, outRoot: string): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [pullScript, "pull", target, "--dir", outRoot], { stdio: ["ignore", 2, 2], windowsHide: true });
    child.once("error", () => done(false));
    child.once("exit", (code) => done(code === 0));
  });
}

async function provision(
  requests: readonly FindRequest[],
  results: readonly AssetFindResult[],
  gameDir: string,
  root: string | null,
): Promise<FindProvisionReport> {
  const report: FindProvisionReport = { linked: [], pulled: [], copied: [], failed: [], skipped: [] };
  const jobs = new Map<string, PullJob>();
  requests.forEach((request, index) => {
    const result = results[index]!;
    const pick = pickOf(request, result);
    if (pick === null) {
      report.skipped.push(request.pick === undefined ? request.query : `${request.query} (no match "${request.pick}")`);
      return;
    }
    if (pick.kind === "game-file") {
      const to = join(gameDir, "public", pick.url);
      if (existsSync(to)) return;
      const from = root === null ? null : join(root, "games", pick.from, "public", pick.url);
      if (from === null || !existsSync(from)) {
        report.failed.push(pick.id);
        return;
      }
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      report.copied.push(pick.id);
      return;
    }
    const job = jobOf(pick);
    if (job !== null && !present(join(gameDir, "public", job.dir))) jobs.set(job.target, job);
  });
  const log = (line: string): void => console.error(line);
  if (root !== null && resolve(gameDir, "..", "..") === root) {
    // A game in the checkout is served from the machine's shared store, like `games:provision`.
    const served = await provisionJobs(gameDir, [...jobs.values()], { pull: spawnPull, log });
    report.linked.push(...served.linked);
    report.pulled.push(...served.pulled);
    report.failed.push(...served.failed, ...served.absent);
    return report;
  }
  for (const job of jobs.values()) {
    if (await spawnPull(job.target, join(gameDir, "public"))) report.pulled.push(job.target);
    else report.failed.push(job.target);
  }
  return report;
}

/**
 * `assets find`: many asset names in, one JSON document out.
 * @internal
 */
export async function cmdFind(argv: readonly string[]): Promise<void> {
  const requests: FindRequest[] = [];
  let gameDir: string | null = null;
  let doProvision = false;
  let limit = 5;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      return;
    } else if (arg === "--list") {
      const file = argv[++i] ?? fail("--list needs a file");
      try {
        requests.push(...parseFindList(readFileSync(file, "utf8")));
      } catch (error) {
        fail(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (arg === "--game") {
      gameDir = resolve(argv[++i] ?? fail("--game needs a folder"));
      if (!existsSync(gameDir)) fail(`--game folder not found: ${gameDir}`);
    } else if (arg === "--provision") {
      doProvision = true;
    } else if (arg === "--limit") {
      const value = argv[++i];
      if (value === undefined || !/^[1-9]\d?$/.test(value)) fail("--limit takes a whole number from 1 to 99");
      limit = Number(value);
    } else if (arg.startsWith("-")) {
      fail(`unknown option ${arg}\n${USAGE}`);
    } else {
      requests.push({ query: arg });
    }
  }
  if (requests.length === 0) fail(USAGE);
  if (doProvision && gameDir === null) fail("--provision needs --game <dir>: the game to put the picks in");

  const root = checkoutRoot(gameDir ?? process.cwd());
  const gameFiles = shippedGameFiles(root, gameDir);
  const servedFrom = gameDir !== null ? join(gameDir, "public") : root !== null ? assetStoreRoot(root) : resolveDefaultOutputRoot(dirname(pullScript));
  const search = (): AssetFindResult[] =>
    requests.map((request) =>
      findAssets(request.query, {
        has: (rel) => present(join(servedFrom, rel)),
        gameFiles,
        ...(gameDir === null ? {} : { game: basename(gameDir) }),
        limit,
      }),
    );
  const results = search();
  if (!doProvision || gameDir === null) {
    console.log(JSON.stringify({ results }, null, 2));
    return;
  }
  const provisioned = await provision(requests, results, gameDir, root);
  console.log(JSON.stringify({ results: search(), provisioned }, null, 2));
  if (provisioned.failed.length > 0) process.exitCode = 1;
}
