// A lane made before a landing fix must still land with the fix: `lane:close` runs beta's current
// landing code, not the copy in the lane's worktree (scripts/landing-code.ts).
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

  fixOnBeta(seed, "lane-close.ts", 'summary: "verify, land,', 'summary: "BETA LANDING FIX verify, land,');
  fixOnBeta(seed, "land-queue.ts", "console.error(`land:queue: ${(error as Error).message}`)", "console.error(`BETA QUEUE FIX ${(error as Error).message}`)");
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

  test("the queue mode starts beta's land-queue too", () => {
    const ran = bun(lane, ["scripts/lane-close.ts", "--queue", "--help"]);
    expect(ran.out).toContain("BETA QUEUE FIX");
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
});
