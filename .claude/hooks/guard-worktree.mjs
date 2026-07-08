import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve, sep } from "node:path";

const allow = () => process.exit(0);
const deny = (reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
};

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  allow();
}

const ti = input?.tool_input ?? {};
const target = ti.file_path ?? ti.notebook_path ?? ti.path;
if (!target) allow();

const abs = resolve(String(target));

if (abs.split(sep).includes(".claude")) allow();

const gitDirOf = (start) => {
  let d = start;
  for (let i = 0; i < 40; i++) {
    try {
      return execFileSync("git", ["-C", d, "rev-parse", "--absolute-git-dir"], {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
    } catch {
      const up = dirname(d);
      if (up === d) return null;
      d = up;
    }
  }
  return null;
};

const gitDir = gitDirOf(dirname(abs));
if (!gitDir) allow();

const inLinkedWorktree = /[\\/]\.git[\\/]worktrees[\\/]/.test(gitDir);
if (inLinkedWorktree) allow();

deny(
  [
    `Blocked: "${target}" is in the primary checkout, not a worktree.`,
    ``,
    `Repo policy (CLAUDE.md): the primary checkout stays on main; all work`,
    `happens in an isolated worktree.`,
    ``,
    `Call EnterWorktree to branch off main into .claude/worktrees/, then retry`,
    `the edit. (A PR comes later, when the work is real.)`,
    ``,
    `(Files under .claude/ stay editable so config is never locked out.)`,
  ].join("\n"),
);
