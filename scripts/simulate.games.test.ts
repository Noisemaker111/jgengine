import { expect, test } from "bun:test";

test("simulate looks for the game under games/", () => {
  const run = Bun.spawnSync([process.execPath, "scripts/simulate.ts", "no-such-game", "noop"], { cwd: `${import.meta.dir}/..`, timeout: 50_000 });
  expect(run.exitCode).not.toBe(0);
  expect(String(run.stderr)).toContain('no game "no-such-game" under games');
}, 60_000);
