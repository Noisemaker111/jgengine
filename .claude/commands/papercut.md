---
description: Mine this session for papercuts and log them to PAPERCUTS.md
---

Review everything that happened in this session so far and pull out the
**papercuts** — small, non-blocking frictions the work ran into: a tool call
that missed and had to be retried, a dead-end or wrong command, a broken link,
a confusing or undocumented setup step, a flaky script, a stale cache, a
misleading error, a non-obvious gotcha. Not real bugs (those are issues), not
what shipped (that's the changelog) — just the sanding-down list.

For each distinct papercut, log it:

    bun run papercut -m <your-model-id> "one or two sentences: what you were doing → what got in the way (a guess at the cause or fix is a bonus)"

Rules:
- Skip anything already sitting in `PAPERCUTS.md` — read it first, don't duplicate.
- If nothing real came up, say so and log nothing. Don't invent friction.
- Keep each entry to one or two sentences, phrased so a later fixer can act on it.
- Report a one-line count of what you logged. Don't paste the entries back.
