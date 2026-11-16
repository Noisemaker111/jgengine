import { expect, test } from "bun:test";
import { win32 } from "node:path";

import { bunExecutable } from "./bunExecutable";

// Windows path rules on every host: CI runs this on Linux, where the host delimiter is ":".
const { delimiter, join } = win32;

const npmGlobal = join("C:", "node");
const npmBunExe = join(npmGlobal, "node_modules", "bun", "bin", "bun.exe");
const PATH = ["", join("C:", "tools"), npmGlobal].join(delimiter);

test("under bun it is this process's own binary", () => {
  expect(bunExecutable({ PATH }, "win32", "/opt/bun", () => false)).toBe("/opt/bun");
});

test("under Node on Windows it finds the real bun.exe behind npm's bun.cmd wrapper", () => {
  expect(bunExecutable({ Path: PATH }, "win32", null, (path) => path === npmBunExe)).toBe(npmBunExe);
});

test("under Node on Windows a bun.exe on PATH wins, and with none it falls back to the name", () => {
  const onPath = join("C:", "tools", "bun.exe");
  expect(bunExecutable({ PATH }, "win32", null, (path) => path === onPath || path === npmBunExe)).toBe(onPath);
  expect(bunExecutable({ PATH }, "win32", null, () => false)).toBe("bun");
});

test("under Node elsewhere the name resolves through PATH as usual", () => {
  expect(bunExecutable({ PATH }, "linux", null, () => true)).toBe("bun");
});
