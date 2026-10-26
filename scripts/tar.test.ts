import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { extractArgs, tarExecutable } from "./tar";

test("POSIX uses the system tar; Windows uses System32 bsdtar, which takes drive paths", () => {
  expect(tarExecutable("linux")).toBe("tar");
  if (process.platform === "win32") expect(tarExecutable("win32").toLowerCase()).toEndWith("system32\\tar.exe");
});

test("an absolute (drive-letter on Windows) archive path extracts", () => {
  const dir = resolve(import.meta.dir, "..", ".scratch", `tar-${process.pid}-${Date.now()}`);
  try {
    mkdirSync(join(dir, "src", "package"), { recursive: true });
    mkdirSync(join(dir, "out"), { recursive: true });
    writeFileSync(join(dir, "src", "package", "a.txt"), "hello");
    const archive = join(dir, "a.tgz");
    execFileSync(tarExecutable(), ["-czf", archive, "-C", join(dir, "src"), "package"], { timeout: 30_000 });
    execFileSync(tarExecutable(), extractArgs(archive, join(dir, "out"), ["--strip-components=1"]), { timeout: 30_000 });
    expect(readFileSync(join(dir, "out", "a.txt"), "utf8")).toBe("hello");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
