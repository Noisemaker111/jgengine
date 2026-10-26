`lane:close` no longer audits how the lane spent its time: it verifies, lands, reads the checks once and prints the report. The waiting gate (exit 2, `--waive`, `--session`) and its read of every transcript on the machine are gone; `bun run lane:audit` still exists as a report on its own.

The session-start hook now only says whether the checkout is cold and whether the branch has unpushed commits. It used to tell every local session it was a cloud container with no worktrees that should open PRs through GitHub MCP tools and merge by hand, which contradicted AGENTS.md, and it reset branches to `origin/beta` on its own.

Prevention: none - tooling and hook change, covered by the lane:close tests.

### Changed

- `bun run lane:close` exits 0 closed, 1 verify or land failed, 3 cannot answer. `--waive` and `--session` are unknown arguments now.
- `.claude/hooks/session-start.mjs` prints at most two notes (cold checkout, unpushed commits) and never fetches, fast-forwards or resets a branch.
