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

The issues named in one ask are one idea: one branch, one PR, landed once at the
end (`workflow` skill, "Scope and issue").

1. Restate each issue's acceptance criteria in a line or two from its thread. If
   an issue is too vague to act on, comment on it asking for the missing detail
   and skip it rather than guess.
2. Deliver through the `workflow` skill (it owns claiming, branching and shipping), routing domain guidance through `jgengine` intake. Issues named here are assigned to this session, so no claim comment is needed.
3. Take the issues in dependency order on the one branch, committing each when
   it works with a message line that ends `Closes #N`. Only an issue unrelated to
   the others in every file and seam gets a branch and PR of its own.
4. Land once with `bun run lane:close` and wait for the merge.

## Report

One line per issue: the PR link plus verification evidence, or why it was skipped.
Merge and release policy: AGENTS.md.
