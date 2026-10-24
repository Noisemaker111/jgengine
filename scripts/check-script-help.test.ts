import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

import { audit, declaresHelp, scriptFilesIn, targetFile } from "./check-script-help";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function fixture(
  scripts: Record<string, string>,
  files: Record<string, string>,
  baseline?: string[],
): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "script-help-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts }));
  mkdirSync(join(root, "scripts"), { recursive: true });
  for (const [file, body] of Object.entries(files)) {
    const path = join(root, "scripts", file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }
  if (baseline !== undefined) {
    writeFileSync(join(root, "scripts", "script-help-baseline.json"), JSON.stringify({ undocumented: baseline }));
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const GOOD = `const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log("thing: does the thing\\n\\nUsage:\\n  bun run thing");
  process.exit(0);
}
`;

describe("targets", () => {
  test("finds the file a command names, wrappers included", () => {
    expect(scriptFilesIn("bun scripts/guard.ts 900 'bun scripts/run-stages.ts gate'")).toEqual([
      "guard.ts",
      "run-stages.ts",
    ]);
  });

  test("passes --help to the inner command, not to the guard that spawns it", () => {
    expect(targetFile("bun scripts/guard.ts 900 'bun scripts/run-stages.ts gate'")).toBe("run-stages.ts");
    expect(targetFile("bun scripts/land.ts")).toBe("land.ts");
    expect(targetFile("bun --cwd apps/web run dev")).toBeNull();
  });

  test("a script declares help by calling the helper or handling --help itself", () => {
    expect(declaresHelp(GOOD)).toBe(true);
    expect(declaresHelp(`if (printHelpIfAsked("thing", USAGE)) process.exit(0);`)).toBe(true);
    expect(declaresHelp("console.log('nothing here')")).toBe(false);
  });
});

describe("audit", () => {
  test("a script with no usage block fails the gate", () => {
    const { root, cleanup } = fixture({ thing: "bun scripts/thing.ts" }, { "thing.ts": "console.log('ran');\n" });
    try {
      const result = audit({ root });
      expect(result.ok).toBe(false);
      expect(result.undocumented).toEqual(["thing.ts"]);
      expect(result.failures.join("\n")).toContain("thing.ts: no usage block");
    } finally {
      cleanup();
    }
  });

  test("a recorded script is reported, not failed, so the list cannot rot silently", () => {
    const { root, cleanup } = fixture({ thing: "bun scripts/thing.ts" }, { "thing.ts": "console.log('ran');\n" }, [
      "thing.ts",
    ]);
    try {
      const result = audit({ root, baseline: ["thing.ts"] });
      expect(result.ok).toBe(true);
      expect(result.probes[0]?.outcome).toBe("reported");
    } finally {
      cleanup();
    }
  });

  test("a script that answers --help passes", () => {
    const { root, cleanup } = fixture({ thing: "bun scripts/thing.ts" }, { "thing.ts": GOOD });
    try {
      const result = audit({ root });
      expect(result.failures).toEqual([]);
      expect(result.ok).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("help that exits non-zero fails, it is not excused", () => {
    const { root, cleanup } = fixture(
      { thing: "bun scripts/thing.ts" },
      { "thing.ts": `if (process.argv.includes("--help")) { console.log("thing: usage"); process.exit(3); }\n` },
    );
    try {
      const result = audit({ root });
      expect(result.ok).toBe(false);
      expect(result.failures.join("\n")).toContain("exited 3");
    } finally {
      cleanup();
    }
  });

  test("help that hangs fails on its own timeout instead of hanging the gate", () => {
    const { root, cleanup } = fixture(
      { thing: "bun scripts/thing.ts" },
      { "thing.ts": `if (process.argv.includes("--help")) { await new Promise(() => {}); }\n` },
    );
    try {
      const result = audit({ root, timeoutMs: 1500 });
      expect(result.ok).toBe(false);
      expect(result.failures.join("\n")).toContain("did not exit within 1.5s");
    } finally {
      cleanup();
    }
  });

  test("help that prints nothing fails", () => {
    const { root, cleanup } = fixture(
      { thing: "bun scripts/thing.ts" },
      { "thing.ts": `if (process.argv.includes("--help")) process.exit(0);\n` },
    );
    try {
      const result = audit({ root });
      expect(result.ok).toBe(false);
      expect(result.failures.join("\n")).toContain("printed no usage block");
    } finally {
      cleanup();
    }
  });

  test("a package script naming a file that does not exist fails", () => {
    const { root, cleanup } = fixture({ "check:guessed": "bun scripts/check-guessed.ts" }, {});
    try {
      const result = audit({ root });
      expect(result.ok).toBe(false);
      expect(result.missing).toEqual(["check-guessed.ts"]);
      expect(result.failures.join("\n")).toContain("but not in scripts/");
    } finally {
      cleanup();
    }
  });

  test("this repository passes its own gate", () => {
    const result = audit({ root: repoRoot });
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("cli", () => {
  test("--help answers without a checkout, and names the flags", () => {
    const result = spawnSync(process.execPath, [join(repoRoot, "scripts", "check-script-help.ts"), "--help"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, JG_CHECKOUT_ROOT: join(tmpdir(), "no-checkout-here") },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("check-script-help:");
    expect(result.stdout).toContain("--write-baseline");
  });
});
