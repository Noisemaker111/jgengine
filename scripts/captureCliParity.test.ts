import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { CAPTURE_FLAGS } from "../packages/jgengine/src/templates/captureArgs";
import { sampleArgv } from "../packages/jgengine/src/templates/captureArgs.test";

// The engine hosts parse with the same table as the portable harness; this proves each one also
// maps every flag of its tool (a flag the host forgot would throw while building its options).
describe("engine shoot/drive accept every shared flag", () => {
  for (const tool of ["shoot", "drive"] as const) {
    test(`bun run ${tool}`, () => {
      const script = join(import.meta.dir, `${tool}-dev.ts`);
      // --serve starts the warm daemon before argument parsing, so it is not exercised here.
      for (const entry of CAPTURE_FLAGS.filter((flag) => flag.tools.includes(tool) && flag.flag !== "--serve")) {
        const run = spawnSync(process.execPath, [script, "demo", ...sampleArgv(entry), "--help"], { encoding: "utf8" });
        expect({ flag: entry.flag, status: run.status, stderr: run.stderr.slice(0, 300) }).toEqual({ flag: entry.flag, status: 0, stderr: "" });
      }
      const bogus = spawnSync(process.execPath, [script, "demo", "--bogus"], { encoding: "utf8" });
      expect(bogus.status).not.toBe(0);
      expect(bogus.stderr).toContain("unknown option --bogus");
    }, 120_000);
  }
});
