import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findProjectRoot, materializeHarness, planHarness } from "./harness";
import { browserLibMjs, shootMjs } from "./templates/gameFiles";

function makeProject(deps: Record<string, string>, opts: { scripts?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "jg-harness-proj-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "demo", dependencies: deps }, null, 2));
  if (opts.scripts === true) {
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "scripts", "shoot.mjs"), "// project shoot\n");
    writeFileSync(join(dir, "scripts", "drive.mjs"), "// project drive\n");
  }
  return dir;
}

describe("findProjectRoot", () => {
  test("finds the nearest ancestor whose package.json depends on @jgengine/*", () => {
    const root = makeProject({ "@jgengine/core": "^0.14.0" });
    const nested = join(root, "src", "game");
    mkdirSync(nested, { recursive: true });
    try {
      expect(findProjectRoot(nested)).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("returns null when no ancestor is a JGengine project", () => {
    const dir = mkdtempSync(join(tmpdir(), "jg-harness-empty-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "plain", dependencies: { react: "19" } }));
    try {
      expect(findProjectRoot(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("materializeHarness", () => {
  test("writes the shared browser.mjs plus the kind's CLI, byte-identical to the scaffold", () => {
    const dir = materializeHarness("shoot");
    try {
      expect(readFileSync(join(dir, "browser.mjs"), "utf8")).toBe(browserLibMjs);
      expect(readFileSync(join(dir, "shoot.mjs"), "utf8")).toBe(shootMjs);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("planHarness", () => {
  test("delegates to the project's own scripts/<kind>.mjs when present (parity with bun run shoot)", () => {
    const root = makeProject({ "@jgengine/core": "^0.14.0" }, { scripts: true });
    try {
      const plan = planHarness("shoot", root);
      expect(plan.ok).toBe(true);
      if (plan.ok) {
        expect(plan.source).toBe("project");
        expect(plan.script).toBe(join(root, "scripts", "shoot.mjs"));
        expect(plan.cwd).toBe(root);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("materializes the bundled harness when the project has no scripts/<kind>.mjs", () => {
    const root = makeProject({ "@jgengine/shell": "^0.14.0" });
    try {
      const plan = planHarness("drive", root);
      expect(plan.ok).toBe(true);
      if (plan.ok) {
        expect(plan.source).toBe("bundled");
        expect(plan.cwd).toBe(root);
        expect(existsSync(plan.script)).toBe(true);
        expect(plan.script.endsWith("drive.mjs")).toBe(true);
        // the bundled shoot.mjs imports its sibling browser.mjs — both must land together
        expect(existsSync(join(plan.script, "..", "browser.mjs"))).toBe(true);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("errors outside a project unless allowNoProject (used for --help)", () => {
    const dir = mkdtempSync(join(tmpdir(), "jg-harness-noproj-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "plain" }));
    try {
      const denied = planHarness("shoot", dir);
      expect(denied.ok).toBe(false);
      if (!denied.ok) expect(denied.error).toContain("JGengine game project");

      const allowed = planHarness("shoot", dir, { allowNoProject: true });
      expect(allowed.ok).toBe(true);
      if (allowed.ok) expect(allowed.source).toBe("bundled");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
