---
name: workflow
description: Carry repository changes from issue through verified ready pull request.
---

# Repository change workflow

Bootstrap, branch, merge and release policy live in [AGENTS.md](../../../AGENTS.md); the cloud session-start hook repeats the parts a session needs. This skill is the delivery order.

## Session handoffs

When this session's context must survive a model/harness switch or a tear-down, use the `ce-handoff` skill (`/ce-handoff` or `/ce-handoff create <focus>`). Resume in the next session with `/ce-handoff resume <path-or-URL>` (or keywords). Orientation stops before action — the user chooses how to continue. Do not dump a full transcript into a plan or issue just to preserve temporary continuity.

## Scope and issue

Search open issues before creating one. An issue the user or a parent session handed you is already yours; for one you picked yourself, post `Working on this in <branch>` on its thread once before implementing so parallel sessions do not collide. Close fixed issues through the PR body (`Closes #N`).

Choose the PR boundary by cohesion:

- combine work sharing a root cause, API migration, files, acceptance criteria, and verification story
- split work that is independently releasable, reviewable, revertible, or likely to conflict
- a PR may close multiple issues with `Closes #N`
- issue count never determines PR count

A session given several issues ships them as separate PRs in dependency order, each branched fresh from `origin/beta`.

## Change

Follow [the framework-first boundary](../../../AGENTS.md#game-changes-improve-the-framework): adopt an existing capability or implement its underlying shared seam, with a real game adopter and removal of superseded local behavior. Update the owning skill/reference plus generated artifacts. Preserve unrelated work. Public API changes require JSDoc and regenerated artifacts (`bun run gen`). Reusable behavior lives in `packages/*`; recipes demonstrate composition, not another implementation. Games keep their unique rules and presentation.

For a shared capability, include the consumer migration and required published version in the delivery evidence. Coordinate other consumer owners rather than patching their files independently. Beta delivery and published game adoption are separate evidence claims; SDK versions in the games workspace belong to its root catalog and lockfile.

A change to published-SDK source (`packages/<pkg>/src`) adds `changes/<branch-name>.md` with its release note ([changes/README.md](../../../changes/README.md)); never edit `CHANGELOG.md` directly, since parallel PRs conflict there.

## Verify

Run the focused tests and typecheck for the packages you touched while iterating with `bun run verify:fast` - the owning packages' typecheck, the tests that can reach the change and the cheap `quick` gates, usually in seconds. One `quick` gate is not cheap: `check-skill-api` costs ~15-21 s and waits for `--skill-api`, a run only `lane:close`/`ship:preflight` pass, so do not read it as a stalled command. Run `bun run verify:fast --full` for everything CI runs once before landing. After committing, run `bun run ship:preflight`. PR CI runs the full gate (types, all tests, Games checks and smoke against the pin in `scripts/games-ref.txt`), so skip local `bun run gate` unless you changed the gate or are reproducing a CI failure. When a change can affect games, `bun run games:check [<id>]` type-checks and tests the games in `./Games` against this checkout's sources (no build or dist copying; `--published` compares with their installed SDK). Move the Games pin with `bun run games:bump` in a PR of its own. Use `jgengine-verify` for scene, UI, or gameplay evidence.

Inspect `git status`, the full diff, and acceptance criteria before staging. Stage only the intended files and commit once the cohesive change is complete.

A change to runtime code under `packages/*/src`, `scripts` or `apps` needs a changed `*.test.ts(x)`: `check:fix-has-test` reads the PR diff against its base and exits 1 otherwise. When no test can reach the bug, say why on its own line of the PR body as `Prevention: none - <reason>`; the gate accepts that exact line and nothing looser. `check:fixture-location` keeps a test's fixture inside the checkout (`.scratch/<name>`): a `tmpdir()` or `mkdtemp()` fixture has no `@jgengine/*` resolution, so it passes in CI and fails in every worktree. Its 62 existing offenders are baselined in `scripts/fixture-location-baseline.json`, and the list only shrinks. `check:path-portability` rejects an assertion that bakes in one platform's separator (`toContain("proofs\\flows")`, `toBe("../../../core")`, `join("/repo", ...)`): build the expected value with `join(...)`/`sep`, or name a genuinely single-platform test in `scripts/path-portability-allow.json` with a reason, which is printed every run.

## Ship

Push with a standalone `git push -u origin <branch>`, open one ready-for-review PR following the PR body shape in AGENTS.md, arm auto-merge per AGENTS.md, subscribe to PR activity, report the link, and end the turn. `bun run land` does that sequence in one command — push, rebase onto `origin/<base>` when the base moved, open or reuse the PR (body from `changes/<branch>.md`, else `--body-file`, else the commit subject), run `--verify "<cmd>"`, watch checks for 25 minutes, merge and wait for `landed <url>`; its exit codes are 0 landed, 1 verify failed, 2 checks failed, 3 could not merge. Land only rewrites a branch it pushed itself: it re-pushes after its own rebase with `--force-with-lease=<branch>`, and it refuses a branch that already exists on the remote with commits this checkout lacks, so start the branch from current `origin/beta` rather than an older copy. Landings queue: land holds one lock for the repo, so a second land prints the branch and pid it waits on and starts when the first finishes, and a lock whose process died or that is older than 30 minutes is broken with a warning. The lock is held from land's first push until its PR is merged, checks included, so a second lane's landing can wait minutes rather than seconds. A CI failure event is fixed on the same branch and pushed to the same PR. When a merge from `beta` is needed, regenerate artifacts with `bun run gen` rather than resolving generated files by hand.

Agents cut releases themselves when [AGENTS.md](../../../AGENTS.md#change-governance) says to; never ask the user. Publishing is a milestone, not a step after each change: at most about one a day, or when a game ships to someone outside this machine. A lane takes merged, unreleased work by pinning the commit in `JGengine-games` with `bun run engine:pin --ref <sha>`, which needs no publish and no pin PR; release when the batch is proved, a game needs a handoff version, or the pins have drifted, and not otherwise. The cut is one command: `bun run release` (`--patch` for a fixes-only release; `--dry-run` to preview) bumps every package, folds `changes/*.md` into `## [Unreleased]` and cuts it into the new version section with the lockstep Migrate bullet, mirrors the notes into the typed `CHANGELOG` export, and regenerates `api.md`. Run it, skim the diff, commit as `Release <version>`, push, open the PR, merge it, then finish the flow in AGENTS.md (fast-forward `main`, confirm npm, published adoption for a game that ships). `check-changelog` accepts the new version section when the SDK version increases and it contains consumer notes beyond the lockstep bump.

The `publish.yml` workflow publishes through npm trusted publishing, without an npm token. Each package must trust GitHub owner `Noisemaker111`, repository `jgengine`, workflow `publish.yml`, with no environment name and direct publishing allowed. A failed OIDC exchange requires checking those package settings; do not restore a token fallback. The workflow's verbose npm output reports the exchange failure.

Restarting a branch whose PR already merged: run `git fetch --prune` first, then start the follow-up from a fresh branch off current `origin/beta`.
