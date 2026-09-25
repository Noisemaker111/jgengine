import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Keeps ./Games on the Noisemaker111/JGengine-games commit pinned in scripts/games-ref.txt, so gates and tests
 * that read Games/ only change when a PR here bumps the pin, never on a games-repo push.
 *
 *   bun run games:clone          clone at the pin (no-op when Games/ exists)
 *   bun run games:update         move an existing clone to the pin
 *   bun run games:bump           write the games repo's current main SHA into the pin, then update
 *   bun scripts/ensure-games.ts --check   report whether Games/ matches the pin
 *
 * GAMES_REF=<sha|branch> overrides the pin for a one-off local try.
 */

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const gamesDir = join(repoRoot, "Games");
const GAMES_REPO = "https://github.com/Noisemaker111/JGengine-games.git";
const refFile = join(repoRoot, "scripts", "games-ref.txt");

function gamesRepoUrl(): string {
  const token = process.env.GAMES_CLONE_TOKEN?.trim();
  if (!token) return GAMES_REPO;
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/Noisemaker111/JGengine-games.git`;
}

function run(args: string[], cwd = repoRoot): boolean {
  return spawnSync("git", args, { stdio: "inherit", cwd }).status === 0;
}

function output(args: string[], cwd = repoRoot): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function pinnedRef(): string {
  const override = process.env.GAMES_REF?.trim();
  if (override) return override;
  const ref = readFileSync(refFile, "utf8").trim();
  if (!/^[0-9a-f]{40}$/.test(ref)) throw new Error(`ensure-games: ${refFile} must hold a full commit SHA (got "${ref}")`);
  return ref;
}

/** Shallow-fetches one ref (GitHub serves any reachable SHA) and detaches Games/ onto it. */
function checkoutPinned(ref: string): boolean {
  if (!run(["-C", gamesDir, "fetch", "--depth", "1", gamesRepoUrl(), ref])) return false;
  return run(["-C", gamesDir, "checkout", "--detach", "FETCH_HEAD"]);
}

const args = process.argv.slice(2);

if (args.includes("--bump")) {
  const line = output(["ls-remote", gamesRepoUrl(), "refs/heads/main"]);
  const sha = line?.split(/\s+/)[0];
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
    console.error("ensure-games: could not read JGengine-games main");
    process.exit(1);
  }
  writeFileSync(refFile, `${sha}\n`);
  console.log(`ensure-games: pinned ${sha} in scripts/games-ref.txt — commit it`);
  args.push("--update");
}

const ref = pinnedRef();

if (args.includes("--check")) {
  if (!existsSync(gamesDir)) {
    console.log("ensure-games: Games/ not found — run bun run games:clone");
  } else {
    const head = output(["-C", gamesDir, "rev-parse", "HEAD"]);
    if (head === ref) console.log(`ensure-games: Games/ at pinned ${ref}`);
    else console.log(`ensure-games: Games/ at ${head ?? "unknown"}, pin is ${ref} — run bun run games:update`);
  }
  process.exit(0);
}

if (existsSync(gamesDir)) {
  if (!args.includes("--update")) process.exit(0);
  console.log(`ensure-games: moving Games/ to ${ref}…`);
  if (!checkoutPinned(ref)) {
    console.error(`ensure-games: could not check out ${ref} in Games/ (local changes?)`);
    process.exit(1);
  }
  process.exit(0);
}

console.log(`ensure-games: cloning ${GAMES_REPO}@${ref} into Games/…`);
if (!run(["init", "--quiet", gamesDir]) || !run(["-C", gamesDir, "remote", "add", "origin", GAMES_REPO]) || !checkoutPinned(ref)) {
  console.error("ensure-games: clone failed");
  process.exit(1);
}
console.log("ensure-games: done — Games/ ready");
