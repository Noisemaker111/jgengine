import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { publicUrl, READY_MARK, SECRET_NAME, setupScript, writeSnapshot } from "./boat-snapshot";

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function temp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  const run = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

function write(root: string, path: string, text: string): void {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** A repository with history on `beta`, a lane two commits past its merge base, and work not yet committed. */
function laneRepo(): string {
  const root = temp("boat-snap-");
  git(root, "init", "-q", "-b", "beta");
  write(root, "a.txt", "one\n");
  write(root, "games/x/big.bin", "x".repeat(10_000));
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "first");
  write(root, "a.txt", "two\n");
  git(root, "commit", "-q", "-am", "second");
  git(root, "update-ref", "refs/remotes/origin/beta", "HEAD");
  git(root, "checkout", "-q", "-b", "agent/lane");
  write(root, "b.txt", "lane\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "lane one");
  write(root, "c.txt", "lane two\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "lane two");
  // beta moves on after the lane forked
  git(root, "checkout", "-q", "beta");
  write(root, "d.txt", "beta later\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "beta later");
  git(root, "update-ref", "refs/remotes/origin/beta", "HEAD");
  git(root, "checkout", "-q", "agent/lane");
  // uncommitted: a changed file, a new file, and a secret-looking file .gitignore does not cover
  write(root, "a.txt", "edited\n");
  write(root, "new/thing.ts", "export const x = 1;\n");
  write(root, ".env.local", "TOKEN=secret\n");
  write(root, "keep/.env.example", "TOKEN=\n");
  return root;
}

describe("writeSnapshot", () => {
  test("the machine gets a real checkout of the exact working tree, origin/beta at the merge base, and no secrets", () => {
    const root = laneRepo();
    const head = git(root, "rev-parse", "HEAD");
    const statusBefore = git(root, "status", "--porcelain");
    const snap = writeSnapshot(root, "origin/beta", temp("boat-push-"));

    // Only the pack and the setup go to the machine.
    expect(readdirSync(snap.dir).sort()).toEqual(["repo.pack", "setup.sh"]);
    expect(snap.head).toBe(head);
    expect(snap.commit).not.toBe(head);
    expect(snap.branch).toBe("agent/lane");
    expect(snap.leftOut).toEqual([".env.local"]);
    // The checkout itself is untouched: same HEAD, same index and status.
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
    expect(git(root, "status", "--porcelain")).toBe(statusBefore);

    // Run the setup the machine runs, here.
    const setup = spawnSync("bash", ["setup.sh"], { cwd: snap.dir, encoding: "utf8" });
    expect({ status: setup.status, output: `${setup.stdout}${setup.stderr}` }).toMatchObject({ status: 0 });
    expect(setup.stdout).toContain(`${READY_MARK} ${snap.commit}`);
    const repo = join(snap.dir, "repo");
    expect(git(repo, "rev-parse", "HEAD")).toBe(snap.commit);
    expect(git(repo, "rev-parse", "HEAD^")).toBe(head);
    expect(git(repo, "rev-parse", "--abbrev-ref", "HEAD")).toBe("agent/lane");
    expect(git(repo, "status", "--porcelain")).toBe("");
    // The diff the steps take names what the lane changed, not what beta did since.
    expect(git(repo, "diff", "--name-only", "origin/beta...HEAD").split("\n").sort()).toEqual(["a.txt", "b.txt", "c.txt", "keep/.env.example", "new/thing.ts"]);
    expect(git(repo, "ls-files").split("\n").sort()).toEqual(["a.txt", "b.txt", "c.txt", "games/x/big.bin", "keep/.env.example", "new/thing.ts"]);
    expect(existsSync(join(repo, ".env.local"))).toBe(false);
    expect(git(repo, "log", "--format=%s", "origin/beta..HEAD").split("\n")).toEqual(["boat: the working tree as verified", "lane two", "lane one"]);
  });

  test("a clean checkout ships HEAD itself, so the machine's commit is the one landing", () => {
    const root = laneRepo();
    git(root, "add", "-A", "--", "a.txt", "new");
    git(root, "commit", "-q", "-m", "lane three");
    rmSync(join(root, ".env.local"));
    rmSync(join(root, "keep"), { recursive: true });
    const snap = writeSnapshot(root, "origin/beta", temp("boat-push-"));
    expect(snap.commit).toBe(git(root, "rev-parse", "HEAD"));
    const setup = spawnSync("bash", ["setup.sh"], { cwd: snap.dir, encoding: "utf8" });
    expect({ status: setup.status, output: `${setup.stdout}${setup.stderr}` }).toMatchObject({ status: 0 });
    expect(git(join(snap.dir, "repo"), "rev-parse", "HEAD")).toBe(snap.commit);
  });
});

describe("secret names", () => {
  test("left out: env files, keys, credentials; kept: examples and ordinary source", () => {
    for (const path of [".env", ".env.local", "apps/web/.env.production", ".npmrc", "id_rsa", "certs/server.pem", "a/b.key", "credentials.json", "config/secrets.json"]) {
      expect(SECRET_NAME.test(path)).toBe(true);
    }
    for (const path of [".env.example", "keep/.env.sample", "src/secretPassage.ts", "scripts/keyboard.ts", "games/x/keys.ts", "README.md"]) {
      expect(SECRET_NAME.test(path)).toBe(false);
    }
  });

  test("a remote URL loses any credentials before it reaches the machine", () => {
    expect(publicUrl("https://x-access-token:ghp_abc@github.com/o/r.git\n")).toBe("https://github.com/o/r.git");
    expect(publicUrl("https://github.com/o/r.git")).toBe("https://github.com/o/r.git");
  });

  test("the setup installs the pinned bun only when the machine's differs, and installs dependencies frozen", () => {
    const script = setupScript({ commit: "c", base: "b", shallow: ["b"], branch: "agent/x", origin: null, bun: "1.4.2" });
    expect(script).toContain("want='1.4.2'");
    expect(script).toContain("bun install --frozen-lockfile");
    expect(script).not.toContain("git remote add");
  });
});
