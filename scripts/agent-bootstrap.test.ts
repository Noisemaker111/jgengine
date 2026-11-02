import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { firstMissingCoreDistEntry } from "./agent-bootstrap";

/** Build a src/dist fixture mirroring how tsgo emits one dist/<path>.js per source. */
function fixture(): { root: string; src: string; dist: string } {
  const root = mkdtempSync(join(tmpdir(), "jg-bootstrap-"));
  const src = join(root, "src");
  const dist = join(root, "dist");
  mkdirSync(join(src, "vfx"), { recursive: true });
  mkdirSync(join(dist, "vfx"), { recursive: true });

  // Non-test sources that must each have a dist/<path>.js.
  writeFileSync(join(src, "index.ts"), "export const a = 1;\n");
  writeFileSync(join(src, "vfx", "screenEffects.ts"), "export const b = 2;\n");
  // Excluded from tsconfig.build — must NOT be required in dist.
  writeFileSync(join(src, "vfx", "screenEffects.test.ts"), "test('x', () => {});\n");
  writeFileSync(join(src, "testFixtures.ts"), "export const fix = 0;\n");
  // Non-ts assets never emit js.
  writeFileSync(join(src, "notes.md"), "# not compiled\n");

  return { root, src, dist };
}

describe("firstMissingCoreDistEntry", () => {
  test("returns null when every non-test source has its dist js", () => {
    const { root, src, dist } = fixture();
    writeFileSync(join(dist, "index.js"), "");
    writeFileSync(join(dist, "vfx", "screenEffects.js"), "");
    try {
      // Absent test/fixture/md outputs do not count as missing.
      expect(firstMissingCoreDistEntry(src, dist)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("flags a partial dist that satisfies a bare directory-exists check", () => {
    const { root, src, dist } = fixture();
    writeFileSync(join(dist, "index.js"), "");
    // vfx/screenEffects.js is missing — the exact real-world failure.
    try {
      expect(firstMissingCoreDistEntry(src, dist)).toBe(join("vfx", "screenEffects.js"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("reports the dist directory itself when it is absent", () => {
    const { root, src } = fixture();
    try {
      expect(firstMissingCoreDistEntry(src, join(root, "nope"))).toBe("dist");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/** A checkout whose install is complete except that core's three is `version`. */
function installedCheckout(version: string): string {
  const root = mkdtempSync(join(tmpdir(), "jg-bootstrap-check-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: { packages: ["packages/*"], catalog: { three: "^0.187.0" } } }));
  writeFileSync(join(root, "bun.lock"), "{}");
  mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
  writeFileSync(join(root, "node_modules", ".bin", process.platform === "win32" ? "tsgo.exe" : "tsgo"), "");
  mkdirSync(join(root, "packages", "core", "node_modules", "three"), { recursive: true });
  writeFileSync(join(root, "packages", "core", "package.json"), JSON.stringify({ name: "@jgengine/core", devDependencies: { three: "catalog:" } }));
  writeFileSync(join(root, "packages", "core", "node_modules", "three", "package.json"), JSON.stringify({ name: "three", version }));
  return root;
}

function bootstrapCheck(root: string): { code: number | null; out: string } {
  const run = Bun.spawnSync({ cmd: [process.execPath, join(import.meta.dir, "agent-bootstrap.ts"), "--check"], cwd: root, timeout: 60_000, stdout: "pipe", stderr: "pipe" });
  return { code: run.exitCode, out: `${run.stdout.toString()}${run.stderr.toString()}` };
}

describe("agent:bootstrap --check", () => {
  test("fails while node_modules holds a three older than the lock asks for", () => {
    const stale = installedCheckout("0.180.0");
    const current = installedCheckout("0.187.0");
    try {
      const old = bootstrapCheck(stale);
      expect(old.code).toBe(1);
      expect(old.out).toContain("packages/core/three 0.180.0 (declared ^0.187.0)");
      expect(bootstrapCheck(current).code).toBe(0);
    } finally {
      rmSync(stale, { recursive: true, force: true });
      rmSync(current, { recursive: true, force: true });
    }
  });
});

describe("three preload", () => {
  test("lets a checkout with nothing installed run bun, so `bun install` can start", () => {
    const root = mkdtempSync(join(tmpdir(), "jg-preload-"));
    try {
      mkdirSync(join(root, "scripts"), { recursive: true });
      mkdirSync(join(root, "packages", "core"), { recursive: true });
      // An empty node_modules, as `bun install` leaves it before linking; without one Bun would auto-install three.
      mkdirSync(join(root, "node_modules"), { recursive: true });
      writeFileSync(join(root, "scripts", "three-preload.ts"), readFileSync(join(import.meta.dir, "three-preload.ts")));
      const run = Bun.spawnSync({
        cmd: [process.execPath, "--preload", "./scripts/three-preload.ts", "-e", "console.log('started')"],
        cwd: root,
        timeout: 60_000,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(run.stderr.toString()).not.toContain("Cannot find package");
      expect(run.stdout.toString().trim()).toBe("started");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
