# Papercuts

Small frictions hit while working — a retried tool call, a dead-end command, a
broken link, a confusing setup step, a flaky script, a stale cache, a misleading
error, a non-obvious gotcha, a task that took far longer than it should have, or
any solvable bump in the road. One or two sentences: what you were doing → what got
in the way (a guess at the cause or fix is a bonus). Log them in the moment, even
though none are blocking; together they show where the repo needs sanding down.

Distinct from CHANGELOG.md (what shipped) and from tracked issues (real bugs).

Log one:

    bun run papercut -m <model> "message"

Every so often these get swept: read the list, make the easy fixes, clear them.
Real bugs and feature gaps get promoted to tracked issues and removed from here;
what remains below is sandbox / environment / workflow / harness friction that
isn't a repository code fix.

---

2026-07-18T18:05:04.668Z — claude — Claude

Renaming a core export with a whole-word sed also rewrote import path specifiers (game/defineGame → game/defineGameDefinition) and bun run build still passed because package build tsconfigs exclude tests/games — a check-types or test run is the only thing that catches specifier breakage after mechanical renames

2026-07-18T20:17:34.900Z — grok-4.5 — NoisemakerJon

recovering issue-1148 custom-UI branch after stash/branch switch mid-session → work was stashed onto main and branch deleted; had to restash-pop and re-apply later edits

2026-07-18T20:41:24.709Z — gpt-5.6-sol — NoisemakerJon

verifying the standalone portable-minimap dev server with the required agent-browser skill -> the agent-browser CLI is not installed or on PATH, so verification had to fall back to the repository's Chrome/CDP shoot --url path

2026-07-18T21:07:45.656Z — gpt-5.6-sol — NoisemakerJon

cleaning up the temporary Vite visual-verification server -> the sandbox allowed starting the preview but denied stopping the exact verified PID, requiring an escalated cleanup

2026-07-18T21:09:23.828Z — gpt-5.6-sol — NoisemakerJon

following AGENTS.md's instruction to run ship:preflight immediately before shipping -> the preflight rejects any dirty implementation and also requires a committed branch diff, so the documented ordering actually requires commit first and cannot validate the exact uncommitted tree

2026-07-18T21:23:09.992Z — gpt-5.6-sol — NoisemakerJon

staging the reviewed worktree diff -> git could not create the linked-worktree index.lock under the main checkout's .git directory without escalation, despite the worktree itself being the authorized writable root

2026-07-18T22:32:42.003Z — gpt-5.6-sol — NoisemakerJon

logging a required repository papercut from this worktree -> bun run papercut reported the declared script missing, then direct Bun execution hit an EPERM sandbox read and required escalation

2026-07-18T22:37:19.095Z — gpt-5.6-sol — NoisemakerJon

running ship preflight immediately after the verified runtime-state commit -> origin/main advanced during the slice, so the branch must be rebased and verification refreshed before the PR can open

2026-07-18T22:46:09.366Z — gpt-5.6-sol — NoisemakerJon

opening the verified runtime-state PR from PowerShell -> gh pr create split multiline --body values even with a literal here-string, requiring --body-file stdin instead

2026-07-18T23:04:31.014Z — gpt-5.6-sol — NoisemakerJon

running independent recipe/surface/test/type checks for portable damage in parallel -> automatic permission review timed out after several minutes before commands ran, so verification had to be retried as one bounded sequence

2026-07-18T23:09:23.301Z — gpt-5.6-sol — NoisemakerJon

running ship preflight after the green portable damage commit -> origin/main advanced with the world API redesign during verification, requiring a final rebase and affected-check refresh

2026-07-19T05:52:23.682Z — claude-fable-5 — Claude

Fan-out research with background subagents → each agent's final report arrives truncated to ~2000 chars in the task-notification and asking the agent to Write its full report to the scratchpad silently fails (file never appears on disk, agent claims success); had to re-poke each agent to paste the full report inline as reply text, which does deliver in full.

2026-07-20T05:01:02.822Z — openai/gpt-5.6-sol — NoisemakerJon

starting the managed shoot daemon for close-up street geometry iteration on Windows -> shoot daemon start failed with Unknown: ChildProcess.kill from PowerShell instead of reporting whether the Chrome/Vite pair started

2026-07-20T05:08:56.818Z — openai/gpt-5.6-sol — NoisemakerJon

running the focused apps/web typecheck after a core geometry change -> it resolved stale @jgengine/core dist declarations and emitted dozens of false missing-export follow-ons instead of identifying that core needed rebuilding first

2026-07-20T05:45:53.185Z — openai/gpt-5.6-sol — NoisemakerJon

running the final repository gate after regenerating skill API docs -> gate stopped at a stale .claude/skills/jgengine/capabilities.md and required a separate bun run gen:capabilities pass even though this change did not add or remove a capability annotation

2026-07-20T06:20:38.630Z — openai/gpt-5.6-sol — NoisemakerJon

running the post-fixture full gate -> changing buildJunctionSurface JSDoc after an earlier generator pass left jgengine-world/api.md stale, so the full build completed before check-skill-api requested another generation

2026-07-20T06:23:44.619Z — openai/gpt-5.6-sol — NoisemakerJon

running the final gate after adding StreetGeometryPreview and regenerating export-manifest before build -> the final published export-manifest test still reported drift after all package builds, requiring regeneration against the built state

2026-07-20T06:27:26.719Z — openai/gpt-5.6-sol — NoisemakerJon

running ship:preflight immediately before commit as the workflow directs -> preflight rejects every uncommitted change as dirty and reports no net branch diff, so it can only run after the commit
