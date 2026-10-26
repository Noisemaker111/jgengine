// `bun run worktree <new|doctor|reap>`: every worktree job behind one command.
import { runVerb, type VerbTable } from "./subcommands";

export const WORKTREE: VerbTable = {
  name: "worktree",
  summary: "make, repair or remove this checkout's lane worktrees",
  verbs: {
    new: { script: "scripts/agent-worktree.ts", detail: "<name>: a ready worktree under .claude/worktrees/ with dependencies and asset packs linked" },
    doctor: { script: "scripts/worktree-doctor.ts", detail: "find broken worktrees; --repair --only <name> fixes one" },
    reap: { script: "scripts/worktree-reap.ts", detail: "remove worktrees whose branch has merged" },
  },
  example: "bun run worktree new tooling-homes",
};

if (import.meta.main) process.exit(runVerb(WORKTREE, process.argv.slice(2)));
