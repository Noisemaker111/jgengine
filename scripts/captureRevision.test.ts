import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clearViteCaches, headRevision, revisionDrifted, shortRevision, viteCacheDirs } from "./captureRevision";

describe("revisionDrifted", () => {
  test("different commits drift", () => {
    expect(revisionDrifted("a".repeat(40), "b".repeat(40))).toBe(true);
  });

  test("same commit does not drift", () => {
    expect(revisionDrifted("a".repeat(40), "a".repeat(40))).toBe(false);
  });

  test("an unknown revision on either side is not drift", () => {
    expect(revisionDrifted(undefined, "a".repeat(40))).toBe(false);
    expect(revisionDrifted("a".repeat(40), undefined)).toBe(false);
    expect(revisionDrifted(undefined, undefined)).toBe(false);
  });
});

describe("headRevision", () => {
  test("reads this repository's HEAD", () => {
    expect(headRevision(process.cwd())).toMatch(/^[0-9a-f]{40}$/);
  });

  test("returns undefined outside a git tree", () => {
    expect(headRevision(mkdtempSync(join(tmpdir(), "jg-norepo-")))).toBeUndefined();
  });
});

describe("clearViteCaches", () => {
  test("removes every dep-optimizer cache that exists and reports it", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-vite-cache-"));
    const [rootCache, devCache] = viteCacheDirs(root);
    for (const dir of [rootCache!, devCache!]) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "_metadata.json"), "{}");
    }

    const removed = clearViteCaches(root);

    expect(removed.sort()).toEqual([rootCache!, devCache!].sort());
    expect(existsSync(rootCache!)).toBe(false);
    expect(existsSync(devCache!)).toBe(false);
  });

  test("is a no-op when nothing is cached", () => {
    expect(clearViteCaches(mkdtempSync(join(tmpdir(), "jg-vite-empty-")))).toEqual([]);
  });
});

describe("shortRevision", () => {
  test("abbreviates and names the unknown case", () => {
    expect(shortRevision("0123456789abcdef")).toBe("01234567");
    expect(shortRevision(undefined)).toBe("unknown");
  });
});
