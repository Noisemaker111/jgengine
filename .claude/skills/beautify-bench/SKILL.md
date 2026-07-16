---
name: beautify-bench
description: Benchmark visual-improvement workflow cost, routing, iterations, and quality.
---

# Beautify benchmark

Measure the process behind a visual-improvement task. The deliverable is evidence that one workflow change improved cost, speed, routing, or final quality; the prettier game is the test artifact.

Use the standing task and run history in [index.md](index.md). Start a new index section before changing the target game.

## One run

1. Record the current base commit and choose one process lever.
2. Give one worker only the user-style visual task plus the repository instructions; hidden workflow coaching invalidates the routing measurement.
3. Record tokens, wall time, screenshot iterations, and final quality against the `jgengine-ui` visual scorecard.
4. Inspect before/after shots independently of the worker's self-assessment.
5. Append one row and a one-line verdict to `index.md`.
6. Keep a lever only when the evidence supports it; revert unsuccessful experiments while preserving their logged result.

Candidate levers include warm browser reuse, half-resolution iteration shots, scoped typechecks, batched edits, routing wording, and worker configuration. Test one lever per run so attribution remains meaningful.

Ship the run record and any proven workflow change as one coherent PR through `workflow`. Historical rows are append-only.
