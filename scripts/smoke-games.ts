/**
 * Boot a curated set of games headless (mode=play) and fail if any throws at
 * runtime. Reuses shoot-dev's capture handshake: shoot exits nonzero when the
 * page sets data-jg-capture=error, which is exactly what an uncaught throw in
 * the shared runner/shell path produces. One clean boot proves the shared
 * GamePlayerShell + <Canvas> world path — where the prod render-loop lived.
 *
 * The play-mode capture handshake (apps/dev/src/captureReady.ts) resolves on a
 * <canvas> OR a shape-agnostic `data-jg-frame-ready` marker the shell stamps for
 * hud-presentation games, so this list covers both world/canvas games and a
 * pure-DOM/HUD game (nonogram).
 */
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const GAMES = ["canyon-chase", "loot-shooter", "drone-derby", "nonogram"];
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

const failures: string[] = [];
for (const game of GAMES) {
  console.log(`\n[smoke] booting ${game} (mode=play)…`);
  const code = await boot(game);
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
console.log(`\n[smoke] all ${GAMES.length} games booted clean`);
