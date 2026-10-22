/**
 * Boot a curated set of games headless (mode=play) and fail if any throws at
 * runtime. Reuses shoot-dev's capture handshake: shoot exits nonzero when the
 * page sets data-jg-capture=error, which is exactly what an uncaught throw in
 * the shared runner/shell path produces. One clean boot proves the shared
 * GamePlayerShell + <Canvas> world path — where the prod render-loop lived.
 *
 * The play-mode capture handshake (apps/dev/src/captureReady.ts) resolves on a
 * <canvas> OR a shape-agnostic `data-jg-frame-ready` marker the shell stamps for
 * hud-presentation games.
 *
 *   bun run smoke                      boot every smoke game in one process
 *   bun run smoke --games deepward     boot one game (CI gives each its own job)
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

export const SMOKE_GAMES = ["harbor-heat", "scrap-signal", "drift-foundry", "deepward"] as const;

export function parseGames(argv: readonly string[]): string[] {
  const at = argv.indexOf("--games");
  if (at < 0) return [...SMOKE_GAMES];
  const value = argv[at + 1];
  const games = (value ?? "").split(",").map((id) => id.trim()).filter((id) => id.length > 0);
  if (games.length === 0) throw new Error("smoke: --games needs at least one game id");
  const unknown = games.filter((game) => !(SMOKE_GAMES as readonly string[]).includes(game));
  if (unknown.length > 0) throw new Error(`smoke: not a smoke game: ${unknown.join(", ")} (known: ${SMOKE_GAMES.join(", ")})`);
  return games;
}

const root = resolve(import.meta.dir, "..");

function boot(game: string): Promise<number> {
  return new Promise((done) => {
    const child = spawn(
      "bun",
      [
        "scripts/shoot-dev.ts",
        "--game",
        game,
        "--mode",
        "play",
        "--timeout",
        "90",
        "--out",
        resolve(root, "shots", `smoke-${game}.png`),
      ],
      { stdio: "inherit", cwd: root },
    );
    child.on("exit", (code) => done(code ?? 1));
  });
}

async function main(): Promise<void> {
  const games = parseGames(process.argv.slice(2));

  if (!existsSync(join(root, "Games"))) {
    if (process.env.CI) {
      console.error("smoke: Games/ checkout is required in CI — run bun run games:clone first");
      process.exit(1);
    }
    console.log("smoke: skipped — no Games/ checkout (games live in Noisemaker111/JGengine-games, run bun run games:clone for a smoke)");
    process.exit(0);
  }

  const failures: string[] = [];
  for (const game of games) {
    console.log(`\n[smoke] booting ${game} (mode=play)…`);
    let code = await boot(game);
    if (code !== 0) {
      // One retry absorbs pure launch-timing flakes (e.g. Chrome debugger not
      // ready in time) without masking a game that consistently throws.
      console.error(`[smoke] ${game} exit ${code} — retrying once`);
      code = await boot(game);
    }
    if (code === 0) console.log(`[smoke] ${game} booted clean`);
    else {
      failures.push(game);
      console.error(`[smoke] ${game} FAILED (exit ${code}) — threw at runtime`);
    }
  }

  if (failures.length > 0) {
    console.error(`\n[smoke] games unplayable: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log(`\n[smoke] all ${games.length} games booted clean`);
}

if (import.meta.main) await main();
