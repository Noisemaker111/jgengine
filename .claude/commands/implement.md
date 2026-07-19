---
description: Implement GitHub issues end to end — one, several, or the whole backlog
argument-hint: "#1110 [#1111 ...] | all"
---

Target: $ARGUMENTS

## Resolve the target

- `all` (or no argument) means a backlog pass: load the `improve` skill and follow
  it end to end; ignore the rest of this file.
- Otherwise treat each `#N`, bare number, or issue URL as one GitHub issue. Read
  each issue thread with the available GitHub tooling. Drop anything closed,
  not found, or already claimed by an open PR, and say so in the report.

## Ship the queue

Group surviving issues by `workflow` PR-boundary rules, then for each group:

1. Restate the acceptance criteria in a line or two from the issue thread. If an
   issue is too vague to act on, comment on it asking for the missing detail and
   skip it rather than guess.
2. **Post the claim comment before implementing** — `Working on this in <branch>`
   via `mcp__github__add_issue_comment` — then deliver through the `workflow`
   skill (fresh branch off `origin/main`, implement, verify, ready PR with
   `Closes #N`), routing domain guidance through `jgengine` intake. The claim
   comment goes up front, not at PR time; an issue that reaches a PR with no
   claim comment on its thread was never actually claimed.
3. Run independent groups as parallel subagent lanes in a single batch; keep
   groups touching the same files in one sequential lane.

## Report

One line per issue: PR link plus verification evidence, or why it was skipped.
In the `Noisemaker111` repo, enable squash auto-merge on every PR so it lands once CI is green — the user never merges by hand; for any other owner/repo, park the PR unmerged. The user still owns release and npm-publish timing.
