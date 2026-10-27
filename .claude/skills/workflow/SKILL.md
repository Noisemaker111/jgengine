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

Choose the PR boundary by cohesion:

- combine work sharing a root cause, API migration, files, acceptance criteria, and verification story
- split work that is independently releasable, reviewable, revertible, or likely to conflict
- a PR may close multiple issues with `Closes #N`
- issue count never determines PR count

A session given several issues ships them as separate PRs in dependency order, each branched fresh from `origin/beta`.

## Change

Follow [the framework-first boundary](../../../AGENTS.md#game-changes-improve-the-framework): adopt an existing capability or implement its underlying shared seam, with a real game adopter and removal of superseded local behavior. Update the owning skill/reference plus generated artifacts. Preserve unrelated work. Public API changes require JSDoc and regenerated artifacts (`bun run gen`). Reusable behavior lives in `packages/*`; recipes demonstrate composition, not another implementation. Games keep their unique rules and presentation.

For a shared capability, the engine change and every in-repo consumer's adoption land in one PR: games run the engine source from the same commit, so no version gates them. Coordinate other consumer owners rather than patching their files independently.

A change to published-SDK source (`packages/<pkg>/src`) lands with `changes/<branch-name>.md`, which `bun run lane:close -m "<what changed>"` writes from its `-m` lines and the diff ([changes/README.md](../../../changes/README.md)); never edit `CHANGELOG.md` directly, since parallel PRs conflict there.

## Verify

While iterating, `bun run verify:fast` runs the owning packages' typecheck, the tests that can reach the change and the cheap `quick` gates, usually in seconds. `bun run lane:close` runs `bun run preflight` and `verify:fast` itself before it lands, so nothing runs by hand before it; `bun run preflight` alone gives the cheap verdict (gen, type-checks, gates) without tests. The type-checks and gates start first and a run stops at the first failure. PR CI runs the full gate (types, all tests, smoke, and the `games` job on every game the change reaches), so skip local `bun run verify:fast --full` unless you changed the gate or are reproducing a CI failure. `verify:fast` follows the import graph: it runs every test, type-check and game boot whose imports reach a changed file (type-only imports count; an import it cannot resolve runs its importer for any change in that package), splits the tests across lanes, and skips a unit that already passed with byte-identical inputs on the same base (`--no-cache` runs everything). An engine change that breaks a game fixes that game in the same PR. Use `jgengine-verify` for scene, UI, or gameplay evidence.

Inspect `git status`, the full diff, and acceptance criteria before staging. Stage only the intended files and commit once the cohesive change is complete.

A bugfix ships a regression test when one is cheap; `verify:fast` exits 2 when a changed runtime file reaches no test at all. `check fixture-location` keeps a test's fixture inside the checkout (`.scratch/<name>`): a `tmpdir()` or `mkdtemp()` fixture has no `@jgengine/*` resolution, so it passes in CI and fails in every worktree. Its 62 existing offenders are baselined in `scripts/fixture-location-baseline.json`, and the list only shrinks. `check path-portability` rejects an assertion that bakes in one platform's separator (`toContain("proofs\\flows")`, `toBe("../../../core")`, `join("/repo", ...)`): build the expected value with `join(...)`/`sep`, or name a genuinely single-platform test in `scripts/path-portability-allow.json` with a reason, which is printed every run.

## Ship

`bun run lane:close -m "<what changed>"` is the one landing command: it runs `bun run preflight` (install, `gen`, type-checks and gates, stopping at the first failure, so a type error stops it in about a minute and no test runs) and then `verify:fast`'s tests, writes `changes/<branch>.md` from its `-m` lines (else from the branch's commit messages, bodies included), commits what the lane changed, pushes, rebases onto `origin/<base>` when the base moved, opens or reuses the PR (body from that note), arms auto-merge, prints the PR URL and `bun run ci:status --pr <n>`, starts the queue for that PR in the background (`lane:close --queue --pr <n>`: rebase when the base moved, wait for the checks, merge), and exits. Keep working; its last line names `bun run background await <id>`, which prints the one-line outcome when you need it. `bun run lane:close --queue` drains every ready PR. Its exit codes are 0 handed off, 1 verify failed, 2 checks already failed, 3 could not hand off. Land only rewrites a branch it pushed itself: it re-pushes after its own rebase with `--force-with-lease=<branch>`, and it refuses a branch that already exists on the remote with commits this checkout lacks (a remote tip this branch once held, its own earlier push before a rebase the lane finished, it rewrites with a lease on that tip), so start the branch from current `origin/beta` rather than an older copy. Landings queue: land holds one lock for the repo around the push and the arming, so a second land prints the branch and pid it waits on and starts when the first finishes, and a lock whose process died or that is older than 30 minutes is broken with a warning. A CI failure event is fixed on the same branch and pushed to the same PR. Land resolves its own rebase: a conflict only in generated files (`api.md`, `capabilities.md`, the export manifest and API baselines, `games/capabilities.json`) takes the base's copy, then land runs `bun run gen` and commits the result; a conflict in the lane's own `changes/<branch>.md` keeps the lane's copy. Only a conflict in source stops it, and the refusal names the files.

Agents cut releases themselves when [AGENTS.md](../../../AGENTS.md#change-governance) says to; never ask the user. Publishing is a milestone, not a step after each change: at most about one a day, or when a game ships to someone outside this machine. Games in `games/` run engine source from the same commit, so no games change waits on a publish; release when the batch is proved or an outside user needs a version, and not otherwise. The cut is one command: `bun run release` (`--patch` for a fixes-only release; `--dry-run` to preview) bumps every package, folds `changes/*.md` into `## [Unreleased]` and cuts it into the new version section with the lockstep Migrate bullet, mirrors the notes into the typed `CHANGELOG` export, and regenerates `api.md`. `bun run release --wait` runs it, lands it, fast-forwards `main`, confirms npm and deploys jgengine.com, as AGENTS.md describes. `check changelog` accepts the new version section when the SDK version increases and it contains consumer notes beyond the lockstep bump.

The `publish.yml` workflow publishes through npm trusted publishing, without an npm token. Each package must trust GitHub owner `Noisemaker111`, repository `jgengine`, workflow `publish.yml`, with no environment name and direct publishing allowed. A failed OIDC exchange requires checking those package settings; do not restore a token fallback. The workflow's verbose npm output reports the exchange failure.

Restarting a branch whose PR already merged: run `git fetch --prune` first, then start the follow-up from a fresh branch off current `origin/beta`.
