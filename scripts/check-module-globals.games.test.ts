import { expect, test } from "bun:test";

test("check-module-globals runs against every game in games/", () => {
  const run = Bun.spawnSync([process.execPath, "scripts/check-module-globals.ts"], { cwd: `${import.meta.dir}/..`, timeout: 50_000 });
  const out = `${run.stdout}${run.stderr}`;
  expect(run.exitCode).toBe(0);
  expect(out).toContain("check-module-globals ok");
  expect(out).not.toContain("outside the reference set");
}, 60_000);
