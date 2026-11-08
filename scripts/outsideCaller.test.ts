import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { environmentEntries, startOutsideCaller, windowsCommandLine, windowsCommandLineArg } from "./outsideCaller";

test("a Windows command line reads back as the same words", () => {
  expect(windowsCommandLineArg("plain")).toBe("plain");
  expect(windowsCommandLineArg("")).toBe('""');
  expect(windowsCommandLineArg("C:\\Program Files\\x")).toBe('"C:\\Program Files\\x"');
  expect(windowsCommandLineArg('say "hi"')).toBe('"say \\"hi\\""');
  expect(windowsCommandLineArg("C:\\dir with space\\")).toBe('"C:\\dir with space\\\\"');
  expect(windowsCommandLine("C:\\bun.exe", ["script.ts", "serve"])).toBe("C:\\bun.exe script.ts serve");
});

test("the started environment keeps every value and drops names Windows cannot hold", () => {
  expect(environmentEntries({ A: "1", B: "x=y", "=C:": "C:\\", D: undefined })).toEqual(["A=1", "B=x=y"]);
});

/**
 * The broker died with its caller's job; a process started here must outlive the process that
 * started it and get exactly the environment it was given.
 */
test("a process started outside the caller outlives it and gets the given environment", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jg-outside-caller-"));
  try {
    const out = join(dir, "env.txt");
    const script = `require("fs").writeFileSync(${JSON.stringify(out)}, String(process.env.JG_OUTSIDE_PROBE))`;
    const pid = startOutsideCaller(process.execPath, ["-e", script], {
      cwd: dir,
      env: { ...process.env, JG_OUTSIDE_PROBE: "value with spaces & symbols" },
    });
    expect(pid).toBeGreaterThan(0);
    const deadline = Date.now() + 20_000;
    while (!existsSync(out) && Date.now() < deadline) await Bun.sleep(100);
    await Bun.sleep(100);
    expect(readFileSync(out, "utf8")).toBe("value with spaces & symbols");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30_000);
