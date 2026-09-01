import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const gamesDir = join(repoRoot, "Games");
const GAMES_REPO = "https://github.com/Noisemaker111/JGengine-games.git";
const refFile = join(repoRoot, "scripts", "games-ref.txt");

function gamesRepoUrl(): string {
  const token = process.env.GAMES_CLONE_TOKEN?.trim();
  if (!token) return GAMES_REPO;
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/Noisemaker111/JGengine-games.git`;
}

function run(cmd: string, args: string[]): boolean {
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: repoRoot });
  return result.status === 0;
}

function gamesRef(): string | null {
  if (!existsSync(refFile)) return null;
  try {
    const ref = readFileSync(refFile, "utf8").trim();
    return ref.length > 0 ? ref : null;
  } catch {
    return null;
  }
}

const update = process.argv.includes("--update");
const checkOnly = process.argv.includes("--check");

if (existsSync(gamesDir)) {
  if (update) {
    console.log("ensure-games: updating Games/ from JGengine-games…");
    const ok = run("git", ["-C", gamesDir, "pull", "--ff-only"]);
    if (!ok) {
      console.error("ensure-games: pull failed — trying fetch + reset");
      run("git", ["-C", gamesDir, "fetch", "origin"]);
      run("git", ["-C", gamesDir, "reset", "--hard", "origin/main"]);
    }
    // In CI, we may want to ensure the ref file is respected; if games-ref.txt exists, checkout that ref
    const ref = gamesRef();
    if (ref !== null) {
      console.log(`ensure-games: checking out pinned ref ${ref}`);
      run("git", ["-C", gamesDir, "checkout", ref]);
    }
  } else if (checkOnly) {
    console.log("ensure-games: Games/ exists");
  } else {
    // already exists, nothing to do
  }
  process.exit(0);
}

if (checkOnly) {
  console.log("ensure-games: Games/ not found — run bun run games:clone to fetch Noisemaker111/JGengine-games");
  process.exit(0);
}

console.log(`ensure-games: cloning ${GAMES_REPO} into Games/…`);
const ref = gamesRef();
const cloneArgs = ["clone", "--depth", "1", gamesRepoUrl(), gamesDir];
if (ref !== null) {
  console.log(`ensure-games: will checkout ref ${ref} after clone`);
}
const ok = run("git", cloneArgs);
if (!ok) {
  console.error("ensure-games: clone failed");
  process.exit(1);
}
if (ref !== null) {
  const ok2 = run("git", ["-C", gamesDir, "checkout", ref]);
  if (!ok2) {
    console.error(`ensure-games: checkout ${ref} failed`);
    process.exit(1);
  }
}
console.log("ensure-games: done — Games/ ready");
