import { expect, test } from "bun:test";

test("check-game-feel runs against the games in games/", () => {
  const run = Bun.spawnSync([process.execPath, "scripts/check-game-feel.ts"], { cwd: `${import.meta.dir}/..`, timeout: 50_000 });
  const out = `${run.stdout}${run.stderr}`;
  expect(run.exitCode).toBe(0);
  expect(out).toContain("check-game-feel ok");
  // It found the games/ folder: the reference set is named and the rest are listed as ignored.
  expect(out).toContain("outside the reference set");
}, 60_000);
