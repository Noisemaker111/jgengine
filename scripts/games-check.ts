/**
 * Type-check and test the reference games against THIS checkout's package sources — no build,
 * no copying dist into the games' node_modules, safe to run from several worktrees at once.
 *
 *   bun run games:check                    every game in ./Games
 *   bun run games:check ember-command      one or more games
 *   bun run games:check --published        the same, against the games' installed @jgengine/*
 *   bun run games:check --types-only | --tests-only
 *
 * Each game gets a throwaway tsconfig that extends its own and maps `@jgengine/<pkg>[/*]` to
 * `packages/<pkg>/src`, mirroring the dev runner's aliases (apps/dev/vite.config.ts).
 */
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";

import { engineSourcePaths, gamePaths, mergeGamePaths } from "./games-check-paths";
import { requireGamesAtPin } from "./games-scope";

const repoRoot = resolve(import.meta.dir, "..");
const gamesRoot = join(repoRoot, "Games");

const args = process.argv.slice(2);
const published = args.includes("--published");
const typesOnly = args.includes("--types-only");
const testsOnly = args.includes("--tests-only");
const only = args.filter((arg) => !arg.startsWith("--"));

if (!existsSync(gamesRoot)) {
  console.error("games:check: ./Games is missing — run `bun run games:clone` (or symlink a games checkout there).");
  process.exit(1);
}
requireGamesAtPin("games:check", repoRoot);
const gamesDir = realpathSync(gamesRoot);
const games = readdirSync(gamesDir).filter(
  (name) =>
    existsSync(join(gamesDir, name, "tsconfig.json")) &&
    existsSync(join(gamesDir, name, "src")) &&
    (only.length === 0 || only.includes(name)),
);
for (const name of only) if (!games.includes(name)) console.error(`games:check: unknown game "${name}"`);

const written: string[] = [];
const cleanup = () => {
  for (const file of written) rmSync(file, { force: true });
};
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));
const engineMap = engineSourcePaths(join(repoRoot, "packages"));
const failures: string[] = [];

type Step = { label: string; command: string; args: string[]; cwd: string };

function runStep(step: Step): Promise<void> {
  const started = performance.now();
  return new Promise((done) => {
    const child = spawn(step.command, step.args, { cwd: step.cwd });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => {
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      if (/No tests found|did not match any test files/.test(output)) {
        console.log(`skip ${step.label} (no tests)`);
        return done();
      }
      const ok = code === 0;
      const summary = output.match(/^\s*\d+ pass[\s\S]*?\d+ fail/m)?.[0].replace(/\s+/g, " ").trim();
      const lines = [`${ok ? "ok  " : "FAIL"} ${step.label} (${seconds}s)${summary ? ` — ${summary}` : ""}`];
      if (!ok) {
        const errors = output.split("\n").filter((line) => /error|\(fail\)|✗/i.test(line));
        lines.push(...(errors.length > 0 ? errors : output.split("\n")).slice(0, 25).map((line) => `     ${line}`));
        failures.push(step.label);
      }
      console.log(lines.join("\n"));
      done();
    });
  });
}

const tsgo = join(repoRoot, "node_modules", ".bin", "tsgo");
const steps: Step[] = [];
for (const game of games) {
  const gameDir = join(gamesDir, game);
  const gameTsconfig = join(gameDir, "tsconfig.json");
  let tsconfig = gameTsconfig;
  if (!published) {
    // Next to the game's own tsconfig: `types` and node_modules lookups resolve from the config's
    // directory. The pid keeps parallel runs (several worktrees) from sharing a file.
    tsconfig = join(gameDir, `.games-check-${process.pid}.tsconfig.json`);
    written.push(tsconfig);
    writeFileSync(
      tsconfig,
      JSON.stringify(
        {
          extends: gameTsconfig,
          compilerOptions: { paths: mergeGamePaths(gamePaths(gameTsconfig), engineMap) },
          include: [join(gameDir, "src")],
          exclude: [join(gameDir, "src/**/*.test.ts"), join(gameDir, "src/**/*.test.tsx")],
        },
        null,
        2,
      ),
    );
  }
  if (!testsOnly) steps.push({ label: `${game} types`, command: tsgo, args: ["--noEmit", "-p", tsconfig], cwd: gameDir });
  if (!typesOnly) {
    const testArgs = ["test", "src", "--timeout", "20000"];
    if (!published) testArgs.push("--tsconfig-override", tsconfig);
    steps.push({ label: `${game} tests`, command: "bun", args: testArgs, cwd: gameDir });
  }
}

const concurrency = Math.max(1, Math.min(steps.length, Math.floor(availableParallelism() / 2) || 1));
let next = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < steps.length) await runStep(steps[next++]!);
  }),
);

console.log(
  failures.length === 0
    ? `games:check ok — ${games.length} game(s) against ${published ? "installed packages" : "this checkout"}`
    : `games:check failed: ${failures.join(", ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
