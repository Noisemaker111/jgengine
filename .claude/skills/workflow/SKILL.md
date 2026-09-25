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

A session given several issues ships them as separate PRs in dependency order, each branched fresh from `origin/main`.

## Change

Implement the underlying seam and update the owning skill/reference plus generated artifacts. Preserve unrelated work. Public API changes require JSDoc and regenerated artifacts (`bun run gen`). Awkward or handrolled glue a custom game needs is lifted into `packages/*` or a skill recipe, not built as a game-local mini-framework or copied from `Games/*`.

A change to published-SDK source (`packages/<pkg>/src`) adds `changes/<branch-name>.md` with its release note ([changes/README.md](../../../changes/README.md)); never edit `CHANGELOG.md` directly, since parallel PRs conflict there.

## Verify

Run the focused tests and typecheck for the packages you touched while iterating (`bun --cwd=packages/<pkg> run test` and `bun --cwd=packages/<pkg> run check-types`; root `bun run check-types` when types cross packages). After committing, run `bun run ship:preflight`. PR CI runs the full gate (types, all tests, Games checks and smoke against the pin in `scripts/games-ref.txt`), so skip local `bun run gate` unless you changed the gate or are reproducing a CI failure. Move the Games pin with `bun run games:bump` in a PR of its own. Use `jgengine-verify` for scene, UI, or gameplay evidence.

Inspect `git status`, the full diff, and acceptance criteria before staging. Stage only the intended files and commit once the cohesive change is complete.

## Ship

Push with a standalone `git push -u origin <branch>`, open one ready-for-review PR following the PR body shape in AGENTS.md, arm auto-merge per AGENTS.md, subscribe to PR activity, report the link, and end the turn. A CI failure event is fixed on the same branch and pushed to the same PR. When a merge from main is needed, regenerate artifacts with `bun run gen` rather than resolving generated files by hand.

When the user asks for a release, it is one command: `bun run release` (`--patch` for an explicitly requested patch; `--dry-run` to preview) bumps every package, folds `changes/*.md` into `## [Unreleased]` and cuts it into the new version section with the lockstep Migrate bullet, mirrors the notes into the typed `CHANGELOG` export, and regenerates `api.md`. Run it, skim the diff, commit as `Release <version>`, push, open the PR.

Restarting a branch whose PR already squash-merged: run `git fetch --prune` first, then start the follow-up from a fresh branch off current `origin/main`.
