import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const script = join(import.meta.dir, "provision-assets.ts");

test("help and unknown options exit before provisioning", () => {
  for (const [args, status, message] of [
    [["--help", "--library"], 0, "usage: games:provision"],
    [["--unknown", "--library"], 1, "unknown option --unknown"],
    [["build", "--help"], 0, "usage: games:provision"],
    [["build", "--unknown"], 1, "unknown option --unknown"],
  ] as const) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 10_000 });
    expect(result.status).toBe(status);
    expect(result.stdout + result.stderr).toContain(message);
    expect(result.stdout + result.stderr).not.toContain(" linked from ");
  }
});
