import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeDir, removeDirSync } from "./removeDir";

// Windows refuses to delete a file another process opened without delete sharing; elsewhere an open
// file never blocks a delete, so the lock case only runs where it can happen.
const windows = process.platform === "win32";

/** Hold `file` open with no sharing from another process for `ms`; resolves once the lock is held. */
async function holdLocked(file: string, ms: number): Promise<{ exited: Promise<number> }> {
  const holder = Bun.spawn([
    "powershell", "-NoProfile", "-Command",
    `$f=[System.IO.File]::Open('${file.replace(/\\/g, "/")}','Open','Read','None'); 'held'; Start-Sleep -Milliseconds ${ms}; $f.Close()`,
  ], { stdout: "pipe", timeout: 30_000 });
  const reader = holder.stdout.getReader();
  const first = await reader.read();
  reader.releaseLock();
  if (!new TextDecoder().decode(first.value).includes("held")) throw new Error("the lock holder did not start");
  return { exited: holder.exited };
}

function lockedFolder(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "jg-remove-dir-"));
  const file = join(dir, "held.txt");
  writeFileSync(file, "held");
  return { dir, file };
}

test.skipIf(!windows)("a plain rm gives up at once on a held file, which is why the retry exists", async () => {
  const { dir, file } = lockedFolder();
  const holder = await holdLocked(file, 600);
  try {
    expect(() => rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })).toThrow();
  } finally {
    await holder.exited;
    removeDirSync(dir);
  }
});

test.skipIf(!windows)("removeDirSync waits out a file another process still holds", async () => {
  const { dir, file } = lockedFolder();
  const holder = await holdLocked(file, 600);
  removeDirSync(dir);
  expect(existsSync(dir)).toBe(false);
  await holder.exited;
});

test.skipIf(!windows)("removeDir waits out a held file without blocking", async () => {
  const { dir, file } = lockedFolder();
  const holder = await holdLocked(file, 600);
  await removeDir(dir);
  expect(existsSync(dir)).toBe(false);
  await holder.exited;
});

test.skipIf(!windows)("a file held past the deadline is an error, not a silent leftover", async () => {
  const { dir, file } = lockedFolder();
  const holder = await holdLocked(file, 1_500);
  try {
    expect(() => removeDirSync(dir, 200)).toThrow();
    expect(existsSync(dir)).toBe(true);
  } finally {
    await holder.exited;
    removeDirSync(dir);
  }
});

test("a missing folder is already removed", async () => {
  const dir = join(tmpdir(), `jg-remove-dir-missing-${process.pid}`);
  removeDirSync(dir);
  await removeDir(dir);
  expect(existsSync(dir)).toBe(false);
});
