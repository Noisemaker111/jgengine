// A lane made before a landing fix must still land with the fix: `lane:close` runs beta's current
// landing code, not the copy in the lane's worktree, unless the lane changes that code itself
// (scripts/landing-code.ts).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const scripts = import.meta.dir;
let top: string;

function git(cwd: string, args: string[]): string {
  const ran = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], {
    cwd,
    encoding: "utf8",
  });
  if (ran.status !== 0) throw new Error(`git ${args.join(" ")}: ${ran.stderr}`);
  return ran.stdout.trim();
}

function bun(cwd: string, args: string[]): { status: number; out: string } {
  const ran = spawnSync(process.execPath, args, { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  return { status: ran.status ?? 1, out: `${ran.stdout ?? ""}${ran.stderr ?? ""}` };
}

/** Rewrite a beta file in place: the stand-in for a landing fix that landed after the lane branched. */
function fixOnBeta(seed: string, file: string, from: string, to: string): void {
  const path = join(seed, "scripts", file);
  const text = readFileSync(path, "utf8");
  expect(text).toContain(from);
  writeFileSync(path, text.replace(from, to));
}

let seed: string;
let lane: string;

beforeAll(() => {
  top = realpathSync(mkdtempSync(join(tmpdir(), "landing-code-")));
  const origin = join(top, "origin.git");
  seed = join(top, "seed");
  lane = join(top, "lane");
  git(top, ["init", "-q", "--bare", "-b", "beta", origin]);
  git(top, ["clone", "-q", origin, seed]);
  git(seed, ["checkout", "-q", "-b", "beta"]);
  // Only the top of scripts/: every landing module lives there, and its subfolders hold fixtures.
  mkdirSync(join(seed, "scripts"));
  for (const entry of readdirSync(scripts, { withFileTypes: true })) {
    if (entry.isFile()) cpSync(join(scripts, entry.name), join(seed, "scripts", entry.name));
  }
  git(seed, ["add", "-A"]);
  git(seed, ["commit", "-q", "-m", "landing code as the lane saw it"]);
  git(seed, ["push", "-q", "origin", "beta"]);
  git(top, ["clone", "-q", "-b", "beta", origin, lane]);
  git(lane, ["checkout", "-q", "-b", "lane"]);

  fixOnBeta(seed, "lane-close.ts", 'summary: "verify, land and merge', 'summary: "BETA LANDING FIX verify, land and merge');
  fixOnBeta(seed, "land-batch.ts", 'summary: "land several finished branches', 'summary: "BETA BATCH FIX land several finished branches');
  fixOnBeta(seed, "verify-receipt.ts", "/** A separate receipt", "/** BETA RECEIPT FORMAT. A separate receipt");
  git(seed, ["commit", "-q", "-am", "a landing fix lands on beta"]);
  git(seed, ["push", "-q", "origin", "beta"]);
}, 60_000);

afterAll(() => rmSync(top, { recursive: true, force: true }));

describe("lane:close runs beta's landing code", () => {
  test("a lane branched before a landing fix runs the fix", () => {
    const ran = bun(lane, ["scripts/lane-close.ts", "--help"]);
    expect(ran.out).toContain("BETA LANDING FIX");
    expect(ran.status).toBe(0);
  }, 30_000);

  test("the batch mode starts beta's land-batch too", () => {
    const ran = bun(lane, ["scripts/lane-close.ts", "--batch", "--help"]);
    expect(ran.out).toContain("BETA BATCH FIX");
  }, 30_000);

  test("beta's copy acts on the lane it was started in, not on itself", () => {
    const cache = join(git(lane, ["rev-parse", "--path-format=absolute", "--git-common-dir"]), "jg-landing");
    expect(existsSync(cache)).toBe(true);
    const copy = readdirSync(cache).find((name) => existsSync(join(cache, name, ".jg-landing-code")));
    expect(copy).toBeDefined();
    const module = join(cache, copy!, "scripts", "landing-code.ts");
    const probe = join(top, "probe.ts");
    writeFileSync(
      probe,
      `import { landingRoot, landingScript } from ${JSON.stringify(module)};\n` +
        `const url = new URL("file:///" + ${JSON.stringify(module.split("\\").join("/"))}).href;\n` +
        `console.log(JSON.stringify({ root: landingRoot(url), land: landingScript(url, "land.ts") }));\n`,
    );
    mkdirSync(join(lane, "deep", "er"), { recursive: true });
    const ran = bun(join(lane, "deep", "er"), [probe]);
    const seen = JSON.parse(ran.out.trim().split("\n").pop()!) as { root: string; land: string };
    expect(realpathSync(seen.root)).toBe(realpathSync(lane));
    expect(seen.land).toBe(join(cache, copy!, "scripts", "land.ts").split("\\").join("/"));
  }, 30_000);

  test("a lane whose receipt module is older than beta's is told so by beta's copy, and one that matches is not", () => {
    const cache = join(git(lane, ["rev-parse", "--path-format=absolute", "--git-common-dir"]), "jg-landing");
    const copy = readdirSync(cache).find((name) => existsSync(join(cache, name, ".jg-landing-code")));
    expect(copy).toBeDefined();
    const module = join(cache, copy!, "scripts", "landing-code.ts");
    const probe = join(top, "receipts-probe.ts");
    writeFileSync(
      probe,
      `import { receiptsBehind } from ${JSON.stringify(module)};\n` +
        `const url = new URL("file:///" + ${JSON.stringify(module.split("\\").join("/"))}).href;\n` +
        `console.log(JSON.stringify({ behind: receiptsBehind(url, ${JSON.stringify(lane)}) }));\n`,
    );
    const seen = (): string | null => (JSON.parse(bun(lane, [probe]).out.trim().split("\n").pop()!) as { behind: string | null }).behind;
    expect(seen()).toBe("this lane's scripts/verify-receipt.ts is older than beta's, so beta's landing code cannot read what its verify:fast records");
    const path = join(lane, "scripts", "verify-receipt.ts");
    const before = readFileSync(path, "utf8");
    // The lane catches up with beta's receipts; Windows line endings alone are not a difference.
    writeFileSync(path, readFileSync(join(seed, "scripts", "verify-receipt.ts"), "utf8").replace(/\n/g, "\r\n"));
    try {
      expect(seen()).toBeNull();
    } finally {
      writeFileSync(path, before);
    }
  }, 30_000);

  test("a lane that changes the landing code itself lands with its own copy", () => {
    const path = join(lane, "scripts", "land.ts");
    const before = readFileSync(path, "utf8");
    writeFileSync(path, `${before}\n// this lane changes how lanes land\n`);
    try {
      const ran = bun(lane, ["scripts/lane-close.ts", "--help"]);
      expect(ran.out).toContain("this lane changes the landing code (scripts/land.ts), so it lands with its own copy");
      expect(ran.out).not.toContain("BETA LANDING FIX");
      expect(ran.status).toBe(0);
    } finally {
      writeFileSync(path, before);
    }
  }, 30_000);
});
