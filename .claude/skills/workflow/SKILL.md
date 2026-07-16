---
name: workflow
description: Carry repository changes from issue through verified ready pull request.
---

# Repository change workflow

## Scope and issue

Start from current `origin/main` on a fresh task branch without discarding user work. Search open issues before creating one. Claim tracked work once with `Working on this in <branch>`; close fixed issues through the PR body.

Choose the PR boundary by cohesion:

- combine work sharing a root cause, API migration, files, acceptance criteria, and verification story
- split work that is independently releasable, reviewable, revertible, or likely to conflict
- a PR may close multiple issues with `Closes #N`
- issue count never determines PR count

## Change

Implement the underlying seam and update the owning skill/reference plus generated artifacts. Preserve unrelated work. Public API changes require JSDoc and regenerated API/capability/export artifacts as applicable. Do not create freestanding design documents.

## Verify

Run checks proportional to risk while iterating. Before shipping, run supported generators, then `bun run gate`. Immediately before commit/push, run `bun run ship:preflight`. Use `jgengine-verify` for scene, UI, or gameplay evidence.

Inspect `git status`, the full diff, and acceptance criteria before staging. Stage only the intended files and commit once the cohesive change is complete.

## Ship

Check whether the branch already has a PR. Push with a standalone `git push -u origin <branch>` command, open one ready-for-review PR, and include validation plus `Closes #N`. Subscribe to PR activity when supported, report the link, and stop.

Never merge, enable auto-merge, or bump a version to force release unless the user explicitly asks. CI failure feedback is fixed on the same branch and pushed to the same PR.

