### Fixed

- `lane:audit --cwd` finds the lane whose own tool calls name that worktree, and prints `attributed ses_… (N references to …)`. Ambiguous ties name their candidates and pick the worst-waiting one; no candidate at all exits non-zero naming the path it searched, so `--fail-on-waiting` has a lane to judge instead of an empty table.
- `land` builds the PR body only from `changes/` fragments its own `git diff origin/beta...HEAD` adds, prints a line for every fragment it ignores, and falls back to the branch's commit subjects.

Root cause: a subagent session stores the directory of the agent that spawned it, so a lane was invisible to its own audit; `changes/` is shared by every lane on the branch, so "newest fragment" was free to be a stranger's note.

Before: `lane:audit --cwd …\lane-wait-audit` exited 1 with "no child sessions", and a body built from a stray `changes/` fragment claimed work the diff did not contain.
After: `lane:audit: attributed ses_e94f3aeedffe2CCMsTlrzgvez5 (136 references to …\lane-wait-audit)`, and `land: ignoring changes/scratch-leftover.md: this branch's diff against origin/beta does not add it`.

Verification:
- `bun test scripts/lane-audit.test.ts scripts/lane-close.test.ts scripts/land.test.ts` — pass
- `bun run verify:fast` — pass
- `bun run lane:audit --cwd <the real lane worktree> --hours 6` — attributed that lane by 136 references
