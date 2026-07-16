---
name: fan-out
description: Parallelize substantial independent work without splitting coherent ownership.
---

# Fan out independent legs

Use workers when at least two substantial units can proceed without each other's output. Keep planning, shared design, overlapping edits, final judgment, and synthesis with the main agent.

Good read-only legs:

- audit separate subsystems or evidence dimensions
- inspect unrelated failures or sources
- run independent, expensive verification suites

Good isolated implementation legs are changes with separate file ownership and no shared design dependency. Give each worker a bounded outcome, inputs it cannot discover, files it owns, and the required return evidence.

Do not fan out quick greps, small edits, screenshots, pushes, waiting, or tasks whose outputs must be reconciled line by line. Never let workers rewrite overlapping files in a shared tree.

Concurrency does not decide PR boundaries. The `workflow` skill decides whether results form one coherent PR or separate changes. Multiple workers may contribute evidence or non-overlapping edits to one PR when the root cause and verification story are shared.

After workers finish, inspect their evidence and the combined diff. Raw worker claims are not completion proof.
