---
name: implement
description: "Implement a piece of work based on a PRD or set of issues."
disable-model-invocation: true
---

Implement the work described by the user in the PRD or issues, following the root `CLAUDE.md`.

1. **Work in a worktree** (`EnterWorktree`), never the primary checkout. If the work maps to a tracked issue, claim it first with a comment naming the branch.
2. **Build against the engine surface** in the `jgengine-api` skill; respect the layering rules. Write co-located tests as you go — for scene/HUD work, add the `summarizeEnvironment` world test per `jgengine-verify` before any screenshot.
3. **Gate regularly:** `bun run check-types` and single test files during the loop, `bun run test` (`bun test packages Games apps/dev`) once at the end.
4. **Review:** run `/code-review` on the diff and address findings.
5. **Ship:** commit with a clear message, push, open the PR (`gh pr create --fill`, `Closes #N` when it resolves an issue), then queue the merge with `gh pr merge --squash --auto`. Never poll CI.
