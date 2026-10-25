import { expect, test } from "bun:test";

test("check-recipes runs against the games in games/", () => {
  const run = Bun.spawnSync([process.execPath, "scripts/check-recipes.ts"], { cwd: `${import.meta.dir}/..`, timeout: 50_000 });
  const out = `${run.stdout}${run.stderr}`;
  expect(run.exitCode).toBe(0);
  expect(out).toContain("no games/* references");
}, 60_000);
