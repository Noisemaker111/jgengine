---
name: workflow
description: Carry repository changes from issue through verified ready pull request.
---

# Repository change workflow

## Bootstrap first

Before claiming issues or editing packages, ensure the checkout can run Bun and resolve built `@jgengine/*` dist:

- `bun run agent:bootstrap` (or `bun run agent:bootstrap --check` if you believe the tree is warm); start it in the background and never kill a slow install — re-invoking joins the running bootstrap
- Local-machine parallelism only: `bun run agent:worktree -- <name>` or Claude `claude --worktree <name>`; cloud containers are already isolated — branch, do not worktree
- Prefer `bun --cwd=packages/<pkg> run <script>` over `bun run --cwd packages/<pkg> <script>` — use the `=` form; the space form (`bun --cwd packages/<pkg> run ...`) mis-parses and prints `bun run` help while exiting 0 without running the script

Do not open a multi-issue program or log papercuts until bootstrap succeeds.

## Scope and issue

Start from current `origin/main` on a fresh task branch without discarding user work. Search open issues before creating one. Claim tracked work once with `Working on this in <branch>`; close fixed issues through the PR body. Prefer **one shippable issue per session** unless the user explicitly requested a multi-slice program.

Choose the PR boundary by cohesion:

- combine work sharing a root cause, API migration, files, acceptance criteria, and verification story
- split work that is independently releasable, reviewable, revertible, or likely to conflict
- a PR may close multiple issues with `Closes #N`
- issue count never determines PR count

## Change

Implement the underlying seam and update the owning skill/reference plus generated artifacts. Preserve unrelated work. Public API changes require JSDoc and regenerated API/capability/export artifacts as applicable. Do not create freestanding design documents. Awkward or handrolled glue a custom game needs (catalog builders, loadout compose, boost meters, and the like) is lifted into `packages/*` or a skill recipe, not built as a game-local mini-framework or copied from `Games/*` (see [AGENTS.md](../../../AGENTS.md)).

## Verify

Run checks proportional to risk while iterating. Before shipping, run supported generators, then `bun run gate`. Immediately before commit/push, run `bun run ship:preflight`. Use `jgengine-verify` for scene, UI, or gameplay evidence.

Inspect `git status`, the full diff, and acceptance criteria before staging. Stage only the intended files and commit once the cohesive change is complete.

## Ship

Check whether the branch already has a PR. Push with a standalone `git push -u origin <branch>` command, open one ready-for-review PR, and include validation plus `Closes #N`. In the `Noisemaker111` repo, enable squash auto-merge on the PR (`enable_pr_auto_merge`, or `gh pr merge --squash --auto`) so GitHub lands it itself once CI is green. Subscribe to PR activity when supported, report the link, and stop.

Enable auto-merge only in the `Noisemaker111` repo — the user never merges by hand there. For any other owner/repo, park the PR unmerged and never enable auto-merge. Never bump a version or publish an npm release to force release unless the user explicitly asks; the user owns release and publish timing. CI failure feedback is fixed on the same branch and pushed to the same PR (auto-merge stays armed and lands the fixed run).

Restarting a branch whose PR already squash-merged (its remote branch auto-deleted): run `git fetch --prune` before pushing again. Without it, `git push --force-with-lease` rejects with `stale info` and the branch has no remote ref to compare against — start the follow-up from a fresh branch off current `origin/main` rather than the parked one.

