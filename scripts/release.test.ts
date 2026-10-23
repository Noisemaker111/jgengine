import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReleaseAncestor, cutChangelog, lockstepBullet, mirrorEntry, nextReleaseVersion, parseSections, sectionLines, splitComment } from "./release";

const MARKDOWN = `# Changelog

## [Unreleased]

<!--
guidance
-->

### Migrate

- **A thing moved.** Do the step,
  which wraps across lines.

### Added

- **New export.** It exists.

### Fixed

- **A bug.** It is gone.

## 0.17.0

### Migrate

- Older note.
`;

describe("release cut", () => {
  test("parses authored bullets and folds Fixed into changed", () => {
    const { body } = splitComment(sectionLines(MARKDOWN, "## [Unreleased]"));
    const sections = parseSections(body);
    expect(sections.migrate).toEqual(["A thing moved. Do the step, which wraps across lines."]);
    expect(sections.added).toEqual(["New export. It exists."]);
    expect(sections.changed).toEqual(["A bug. It is gone."]);
    expect(sections.removed).toEqual([]);
  });

  test("renames the block, prepends the lockstep bullet, keeps a fresh Unreleased", () => {
    const next = cutChangelog(MARKDOWN, "0.18.0", lockstepBullet("0.18.0", "0.15.0", "0.5.0"));
    expect(next).toContain("## [Unreleased]");
    expect(next).toContain("## 0.18.0");
    expect(next).toContain("guidance");
    expect(next.indexOf("## 0.18.0")).toBeLessThan(next.indexOf("## 0.17.0"));
    expect(next.indexOf("^0.18.0")).toBeLessThan(next.indexOf("A thing moved"));
    expect(sectionLines(next, "## [Unreleased]").join("\n")).not.toContain("A thing moved");
    expect(sectionLines(next, "## 0.18.0").join("\n")).toContain("New export");
  });

  test("mirrors a typed entry at the top of the record", () => {
    const source = `export const CHANGELOG: Record<string, ChangelogEntry> = {\n  "0.17.0": {\n  },\n};\n`;
    const next = mirrorEntry(source, "0.18.0", { migrate: ["a"], added: [], changed: ["b"], removed: [] });
    expect(next.indexOf(`"0.18.0"`)).toBeLessThan(next.indexOf(`"0.17.0"`));
    expect(next).toContain(`    migrate: [\n      "a",\n    ],`);
    expect(next).toContain("    added: [],");
    expect(() => mirrorEntry(next, "0.18.0", { migrate: [], added: [], changed: [], removed: [] })).toThrow();
  });
});

test("patch release preserves the minor line and finalizes prereleases", () => {
  expect(nextReleaseVersion("0.18.0", true)).toBe("0.18.1");
  expect(nextReleaseVersion("0.18.9", true)).toBe("0.18.10");
  expect(nextReleaseVersion("0.18.1-rc.2", true)).toBe("0.18.1");
  expect(nextReleaseVersion("0.18.0")).toBe("0.19.0");
});

const ROOT = fileURLToPath(new URL("..", import.meta.url));

interface Fixture {
  dir: string;
  git: (...args: string[]) => string;
  commit: (file: string, body: string, message: string) => void;
  done: () => void;
}

/** A throwaway repository whose `beta` branch is the branch everything lands on. */
function makeRepo(name: string): Fixture {
  const dir = join(ROOT, ".scratch", `release-ancestor-${name}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const identity = {
    ...process.env,
    GIT_AUTHOR_NAME: "release-fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.test",
    GIT_COMMITTER_NAME: "release-fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.test",
  };
  const git = (...args: string[]): string => {
    const out = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: identity });
    if (out.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${out.stderr}`);
    return out.stdout.trim();
  };
  const commit = (file: string, body: string, message: string): void => {
    writeFileSync(join(dir, file), body);
    git("add", ".");
    git("commit", "-q", "-m", message);
  };
  git("init", "-q", "-b", "beta");
  commit("base.txt", "base\n", "base");
  return { dir, git, commit, done: () => rmSync(dir, { recursive: true, force: true }) };
}

describe("release ancestor guard", () => {
  test("refuses a release commit behind beta and names the missing commit", () => {
    const repo = makeRepo("behind");
    try {
      repo.git("checkout", "-q", "-b", "main");
      repo.commit("version.txt", "0.36.0\n", "chore(release): 0.36.0");
      repo.git("checkout", "-q", "beta");
      repo.commit("system.txt", "export {};\n", "core: add agents/system");
      repo.git("checkout", "-q", "main");

      const report = checkReleaseAncestor({ cwd: repo.dir, ref: "beta" });
      expect(report.ok).toBe(false);
      expect(report.missing.join("\n")).toContain("core: add agents/system");
      expect(report.reason).toContain("does not contain");
    } finally {
      repo.done();
    }
  });

  test("passes once the release commit contains beta", () => {
    const repo = makeRepo("contains");
    try {
      repo.git("checkout", "-q", "-b", "main");
      repo.commit("version.txt", "0.36.0\n", "chore(release): 0.36.0");
      repo.git("checkout", "-q", "beta");
      repo.commit("system.txt", "export {};\n", "core: add agents/system");
      repo.git("checkout", "-q", "main");
      repo.git("merge", "-q", "--no-ff", "beta", "-m", "Merge beta");

      const report = checkReleaseAncestor({ cwd: repo.dir, ref: "beta" });
      expect(report.ok).toBe(true);
      expect(report.missing).toEqual([]);
      expect(report.refSha).toBe(repo.git("rev-parse", "beta"));
    } finally {
      repo.done();
    }
  });

  test("fails closed when the branch everything lands on is missing", () => {
    const repo = makeRepo("noref");
    try {
      const report = checkReleaseAncestor({ cwd: repo.dir, ref: "origin/beta" });
      expect(report.ok).toBe(false);
      expect(report.reason).toContain("cannot resolve origin/beta");
    } finally {
      repo.done();
    }
  });

  test("the publish gate exits non-zero and prints the missing commit", () => {
    const repo = makeRepo("cli");
    try {
      repo.git("checkout", "-q", "-b", "main");
      repo.commit("version.txt", "0.36.0\n", "chore(release): 0.36.0");
      repo.git("checkout", "-q", "beta");
      repo.commit("system.txt", "export {};\n", "core: add agents/system");
      repo.git("checkout", "-q", "main");

      const script = join(ROOT, "scripts", "check-release-ancestor.ts");
      const refused = spawnSync("bun", [script, "--cwd", repo.dir, "--ref", "beta"], { encoding: "utf8" });
      expect(refused.status).toBe(1);
      expect(`${refused.stdout}${refused.stderr}`).toContain("core: add agents/system");

      repo.git("merge", "-q", "--no-ff", "beta", "-m", "Merge beta");
      const accepted = spawnSync("bun", [script, "--cwd", repo.dir, "--ref", "beta"], { encoding: "utf8" });
      expect(accepted.status).toBe(0);
      expect(accepted.stdout).toContain("check-release-ancestor ok");
    } finally {
      repo.done();
    }
  });
});
