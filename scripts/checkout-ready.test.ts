import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import { checkoutProblem, EXIT_NOT_SET_UP } from "./checkout-ready";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function bareCheckout(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "checkout-ready-"));
  mkdirSync(join(root, "scripts"), { recursive: true });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function run(script: string, args: string[], root: string) {
  return spawnSync(process.execPath, [join(repoRoot, "scripts", script), ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, JG_CHECKOUT_ROOT: root },
  });
}

describe("probe", () => {
  test("no node_modules is a checkout problem naming the fix", () => {
    const { root, cleanup } = bareCheckout();
    try {
      const problem = checkoutProblem(root);
      expect(problem).not.toBeNull();
      expect(problem?.detail).toContain("node_modules is missing");
      expect(problem?.fix).toBe("bun install");
    } finally {
      cleanup();
    }
  });

  test("an incomplete node_modules counts, and is not read as a test failure", () => {
    const { root, cleanup } = bareCheckout();
    try {
      mkdirSync(join(root, "node_modules"), { recursive: true });
      expect(checkoutProblem(root)?.detail).toContain("incomplete");
    } finally {
      cleanup();
    }
  });

  test("this checkout is set up", () => {
    expect(checkoutProblem(repoRoot)).toBeNull();
  });
});

describe("commands in a checkout that cannot run them", () => {
  test("verify:fast prints the fix and exits 78, never a raw module error", () => {
    const { root, cleanup } = bareCheckout();
    try {
      const result = run("verify-fast.ts", [], root);
      expect(result.status).toBe(EXIT_NOT_SET_UP);
      expect(result.status).toBe(78);
      expect(result.stderr).toContain("verify:fast: this checkout cannot run that yet");
      expect(result.stderr).toContain("Fix: bun install");
      expect(result.stderr).toContain("bun run agent:bootstrap");
      expect(`${result.stdout}${result.stderr}`).not.toContain("command not found");
      expect(result.stdout).not.toContain("Cannot find module");
    } finally {
      cleanup();
    }
  });

  test("land and lane:close say the same thing instead of failing inside git", () => {
    const { root, cleanup } = bareCheckout();
    try {
      for (const [script, line] of [
        ["land.ts", "land: this checkout cannot run that yet"],
        ["lane-close.ts", "lane:close: this checkout cannot run that yet"],
      ] as const) {
        const result = run(script, [], root);
        expect(result.status).toBe(EXIT_NOT_SET_UP);
        expect(result.stderr).toContain(line);
        expect(result.stderr).toContain("Fix: bun install");
      }
    } finally {
      cleanup();
    }
  });

  test("--help still answers in a checkout with no node_modules", () => {
    const { root, cleanup } = bareCheckout();
    try {
      for (const [script, first] of [
        ["land.ts", "land: "],
        ["lane-close.ts", "lane-close: "],
        ["ci-status.ts", "ci-status: "],
        ["lane-audit.ts", "lane-audit: "],
        ["verify-fast.ts", "verify-fast: "],
      ] as const) {
        const result = run(script, ["--help"], root);
        expect(result.status).toBe(0);
        expect(result.stdout).toContain(first);
        expect(result.stdout).toContain("--help, -h");
      }
    } finally {
      cleanup();
    }
  });
});

describe("a real failure stays a real failure", () => {
  test("an installed checkout is not refused: verify:fast plans and exits on its own verdict", () => {
    const result = run("verify-fast.ts", ["--plan"], repoRoot);
    expect(result.status).not.toBe(EXIT_NOT_SET_UP);
    expect(`${result.stdout}${result.stderr}`).not.toContain("this checkout cannot run that yet");
  });

  test("a script whose help is broken still fails the gate with exit 1", () => {
    const root = mkdtempSync(join(tmpdir(), "checkout-ready-gate-"));
    try {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ scripts: { broken: "bun scripts/broken.ts" } }),
      );
      writeFileSync(
        join(root, "scripts", "broken.ts"),
        `if (process.argv.includes("--help")) { console.log("broken: usage"); process.exit(4); }\n`,
      );
      const result = spawnSync(process.execPath, [join(repoRoot, "scripts", "check-script-help.ts"), "--root", root], {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 60_000,
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("exited 4");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
