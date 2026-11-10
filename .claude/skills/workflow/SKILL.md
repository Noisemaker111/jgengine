---
name: workflow
description: Carry repository changes from issue through verified ready pull request.
---

# Repository change workflow

Bootstrap, branch, merge and release policy live in [AGENTS.md](../../../AGENTS.md); the cloud session-start hook repeats the parts a session needs. This skill is the delivery order.

## Session handoffs

When this session's context must survive a model/harness switch or a tear-down, use the `ce-handoff` skill (`/ce-handoff` or `/ce-handoff create <focus>`). Resume in the next session with `/ce-handoff resume <path-or-URL>` (or keywords). Orientation stops before action — the user chooses how to continue. Do not dump a full transcript into a plan or issue just to preserve temporary continuity.

## Scope and issue

Search open issues before creating one. An issue the user or a parent session handed you is already yours; for one you picked yourself, post `Working on this in <branch>` on its thread once before implementing so parallel sessions do not collide. Close fixed issues through the PR body: `bun run lane:close -m "Closes #N"`.

One idea is one branch and one PR (the global rules). The idea is what the session was asked for in one go: every milestone, issue, engine seam, game adoption and cleanup it implies goes on the same branch as commits, and lands once at the end.

- a PR closes every issue the idea covers, one `Closes #N` line each
- issue, milestone and package count never determine PR count
- only an unrelated finding leaves the branch: file it as an issue rather than opening a second PR
- a session given several unrelated asks ships one PR per ask, each branched fresh from `origin/beta`

## Change

Follow [the framework-first boundary](../../../AGENTS.md#game-changes-improve-the-framework): adopt an existing capability or implement its underlying shared seam, with a real game adopter and removal of superseded local behavior. Update the owning skill/reference plus generated artifacts. Preserve unrelated work. Public API changes require JSDoc and regenerated artifacts (`bun run gen`). Reusable behavior lives in `packages/*`; recipes demonstrate composition, not another implementation. Games keep their unique rules and presentation.

For a shared capability, the engine change and every in-repo consumer's adoption land in one PR: games run the engine source from the same commit, so no version gates them. Coordinate other consumer owners rather than patching their files independently.

A change to published-SDK source (`packages/<pkg>/src`) lands with `changes/<branch-name>.md`, which `bun run lane:close -m "<what changed>"` writes from its `-m` lines and the diff ([changes/README.md](../../../changes/README.md)); never edit `CHANGELOG.md` directly, since parallel PRs conflict there.

## Verify

For a suspected intermittent test failure, use `bun run test:repeat --runs 20 --workers 4 -- path/to/test.ts` to repeat the targeted test under concurrent load. Use `--json` to retain each run's output, duration, command and exit status; any failure or timeout fails the command. Choose the run and worker counts for the investigation instead of treating a clean sample as proof a flake is gone.

While iterating, `bun run verify:fast` runs what the change reaches; `lane:close` runs `preflight` and its tests itself, so nothing runs by hand before it ([AGENTS.md](../../../AGENTS.md#runtime-and-verification)). Use `jgengine-verify` for scene, UI, or gameplay evidence.

Each `verify:fast` run names its receipt under `.scratch/verify-fast/runs/`. It keeps the revision, dirty identity, selected work, cache hits, step intervals, blocked steps and original failure output; a running step without an end remains visible after interruption. Intervals can overlap, and time outside measured intervals is unknown. `--plan` writes no receipt.

Commit as you go: after each step that works, inspect `git status` and its diff, stage only that step's files (`git add <paths>`, never a lockfile you did not mean to change or anything under `.scratch/`) and `git commit -m "<one plain line of what changed>"`. Each message is a line of the PR body and the changelog, so write it for a reader, with `Fixed:`, `Added:` or `Removed:` where it fits. Nothing is pushed or opened until the landing.

A bugfix ships a regression test when one is cheap; `verify:fast --plan` lists a changed runtime file that reaches no test. A test fixture that imports `@jgengine/*` lives inside the checkout (`.scratch/<name>`): a `tmpdir()` fixture has no package resolution, so it passes in CI and fails in every worktree. `check path-portability` rejects an assertion that bakes in one platform's separator (`toContain("proofs\\flows")`, `toBe("../../../core")`, `join("/repo", ...)`): build the expected value with `join(...)`/`sep`, or name a genuinely single-platform test in `scripts/path-portability-allow.json` with a reason, which is printed every run.

## Ship

`bun run lane:close` is the one landing command, run once per idea when the whole idea works, as a harness background command (Bash `run_in_background`) whose exit calls you back. It runs `bun run preflight --no-verify` (install, conflict markers, `gen`) and `verify:fast --landing` (type-checks, every CI gate, the tests, boots and the site build; a passing run of the same tree just before is reused), writes `changes/<branch>.md` from the commit messages or `-m` lines, commits, pushes, opens or reuses the PR (every GitHub call is `gh api` through `scripts/github.ts`), and merges it while its head is the commit verify:fast passed on. A base that moved without a conflict merges as is; a conflicting one is rebased (generated-file, `changes/` and `CREDITS.md` conflicts resolve themselves; only a source conflict comes back to the lane), what the rebase changed is verified, and then it merges. The idea is done when the last line names the merge commit; a failure it names is fixed on the same branch and closed again. Exit codes: 0 merged, 1 verify, land or the merge failed, 3 cannot answer, 4 another lane:close is still running in this worktree (it names the run; a crashed run's lock breaks itself, so never start a second run to hurry the first). Land only rewrites a branch it pushed itself, so start the branch from current `origin/beta` ([AGENTS.md](../../../AGENTS.md#runtime-and-verification)).

Releases need the user's authorization to publish and deploy under the global rules. Publishing is a milestone, not a step after each change: at most about one a day, or when a game ships to someone outside this machine. Games in `games/` run engine source from the same commit, so no games change waits on a publish. The cut is one command: `bun run release` (`--patch` for a fixes-only release; `--dry-run` to preview) bumps every package, folds `changes/*.md` into `## [Unreleased]` and cuts it into the new version section with the lockstep Migrate bullet, mirrors the notes into the typed `CHANGELOG` export, and regenerates `api.md`. `bun run release --wait` runs it, lands it, fast-forwards `main`, confirms npm and deploys jgengine.com.

The `publish.yml` workflow publishes through npm trusted publishing, without an npm token. Each package must trust GitHub owner `Noisemaker111`, repository `jgengine`, workflow `publish.yml`, with no environment name and direct publishing allowed. A failed OIDC exchange requires checking those package settings; do not restore a token fallback. The workflow's verbose npm output reports the exchange failure.

Restarting a branch whose PR already merged: run `git fetch --prune` first, then start the follow-up from a fresh branch off current `origin/beta`.
