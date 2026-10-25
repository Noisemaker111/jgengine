import { expect, test } from "bun:test";

test("check-skill-sync accepts the design notes and credits a game keeps in games/", () => {
  const run = Bun.spawnSync([process.execPath, "scripts/check-skill-sync.ts"], { cwd: `${import.meta.dir}/..`, timeout: 50_000 });
  expect(`${run.stdout}${run.stderr}`).not.toContain("games/");
  expect(run.exitCode).toBe(0);
}, 60_000);
