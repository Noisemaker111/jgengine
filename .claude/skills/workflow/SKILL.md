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

One idea is one branch and one PR ([AGENTS.md](../../../AGENTS.md#change-governance)). The idea is what the session was asked for in one go: every milestone, issue, engine seam, game adoption and cleanup it implies goes on the same branch as commits, and lands once at the end.

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

Commit as you go: after each step that works, inspect `git status` and its diff, stage only that step's files (`git add <paths>`, never a lockfile you did not mean to change or anything under `.scratch/`) and `git commit -m "<one plain line of what changed>"`. Each message is a line of the PR body and the changelog, so write it for a reader, with `Fixed:`, `Added:` or `Removed:` where it fits. Nothing is pushed or opened until the landing.

A bugfix ships a regression test when one is cheap; `verify:fast` exits 2 when a changed runtime file reaches no test at all. `check fixture-location` keeps a test's fixture inside the checkout (`.scratch/<name>`): a `tmpdir()` or `mkdtemp()` fixture has no `@jgengine/*` resolution, so it passes in CI and fails in every worktree. Its 62 existing offenders are baselined in `scripts/fixture-location-baseline.json`, and the list only shrinks. `check path-portability` rejects an assertion that bakes in one platform's separator (`toContain("proofs\\flows")`, `toBe("../../../core")`, `join("/repo", ...)`): build the expected value with `join(...)`/`sep`, or name a genuinely single-platform test in `scripts/path-portability-allow.json` with a reason, which is printed every run.

## Ship

`bun run lane:close` is the one landing command, run once per idea when the whole idea works: it runs `bun run preflight` (install, `gen`, type-checks and every CI gate, so every cheap failure is named before any test runs) and then `verify:fast`'s tests, writes `changes/<branch>.md` from the branch's commit messages (bodies included), or from `-m` lines when given, commits anything left, pushes, rebases onto `origin/<base>` when the base moved, opens or reuses the PR (body from that note), arms auto-merge, prints the PR URL and `bun run ci:status --pr <n>`, starts the queue for that PR in the background (`lane:close --queue --pr <n>`: rebase when the base moved, wait for the checks, merge), and exits. It takes several minutes: run it in the foreground with a 10-minute timeout, and if the shell moves it to the background, wait for it rather than ending the turn. Its last line names `bun run background await <id> --timeout 540`: run that in the foreground, again while it is still waiting, until it prints the merge. The idea is done when its PR is merged; a failure it names is fixed on the same branch and closed again. `bun run lane:close --queue` drains every ready PR. Its exit codes are 0 handed off, 1 verify failed, 2 checks already failed, 3 could not hand off. Land only rewrites a branch it pushed itself: it re-pushes after its own rebase with `--force-with-lease=<branch>`, and it refuses a branch that already exists on the remote with commits this checkout lacks (a remote tip this branch once held, its own earlier push before a rebase the lane finished, it rewrites with a lease on that tip), so start the branch from current `origin/beta` rather than an older copy. Landings queue behind one repo lock. Land and the queue resolve their own rebases, so a lane never rebases by hand: generated-file, `changes/` and `CREDITS.md` conflicts are theirs, and only a source conflict comes back to the lane ([AGENTS.md](../../../AGENTS.md#change-governance)).

Agents cut releases themselves when [AGENTS.md](../../../AGENTS.md#change-governance) says to; never ask the user. Publishing is a milestone, not a step after each change: at most about one a day, or when a game ships to someone outside this machine. Games in `games/` run engine source from the same commit, so no games change waits on a publish; release when the batch is proved or an outside user needs a version, and not otherwise. The cut is one command: `bun run release` (`--patch` for a fixes-only release; `--dry-run` to preview) bumps every package, folds `changes/*.md` into `## [Unreleased]` and cuts it into the new version section with the lockstep Migrate bullet, mirrors the notes into the typed `CHANGELOG` export, and regenerates `api.md`. `bun run release --wait` runs it, lands it, fast-forwards `main`, confirms npm and deploys jgengine.com, as AGENTS.md describes. `check changelog` accepts the new version section when the SDK version increases and it contains consumer notes beyond the lockstep bump.

The `publish.yml` workflow publishes through npm trusted publishing, without an npm token. Each package must trust GitHub owner `Noisemaker111`, repository `jgengine`, workflow `publish.yml`, with no environment name and direct publishing allowed. A failed OIDC exchange requires checking those package settings; do not restore a token fallback. The workflow's verbose npm output reports the exchange failure.

Restarting a branch whose PR already merged: run `git fetch --prune` first, then start the follow-up from a fresh branch off current `origin/beta`.
