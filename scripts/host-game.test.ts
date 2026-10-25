import { expect, test } from "bun:test";

test("host-game loads the game from games/<id>", () => {
  const run = Bun.spawnSync([process.execPath, "scripts/host-game.ts", "no-such-game"], { cwd: `${import.meta.dir}/..`, timeout: 50_000 });
  expect(run.exitCode).not.toBe(0);
  expect(String(run.stderr).replaceAll("\\", "/")).toContain("games/no-such-game/src/index.tsx");
}, 60_000);
