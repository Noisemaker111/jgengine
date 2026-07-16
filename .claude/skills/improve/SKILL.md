---
name: improve
description: Work the issue backlog and cut framework friction after every shipped fix.
---

# Improve the framework

Use this for backlog missions ("look at all the issues, plan each one, implement, verify") and for any issue where the goal is a better engine, not just a closed ticket. The deliverable is two-fold: the fixes themselves, and a framework where the next fix is measurably cheaper.

## Plan the pass

1. List open issues, drop stale or duplicate ones, and group the rest by shared root cause or seam using `workflow` PR-boundary rules.
2. Order the queue so early fixes create seams later fixes reuse: infrastructure-shaped issues first, consumers after.
3. Use `fan-out` only for groups that are genuinely independent; keep issues sharing a seam in one sequential lane.

## Ship one issue

Route through `jgengine` intake and deliver through `workflow`, with evidence via `jgengine-verify`. Merge only when the mission explicitly asks for merges; otherwise park the PR for the user.

While implementing, record friction as it happens:

- `blocker` — no engine path existed; you wrote one-off or game-local code
- `workaround` — an engine path existed but fought you
- `ergonomics` — it worked but took too many edits, lookups, or retries

## Retrospect before the next issue

After each shipped fix, answer from the actual diff, not memory:

1. **Size check.** Most gaps here are ~20-line concepts. Count files touched and lines changed. A small concept that required edits in many places is itself a finding — name the missing seam, wrong default, or missing generator that forced the spread.
2. **Exact-diff replay.** If this same diff arrived tomorrow, what one upstream change would halve it? Candidates: a new primitive, a better default, a codegen step, a skill or capability-index fix, a test harness.
3. **Act now.** A seam fix that shares the issue's verification story lands in the same PR. Anything larger becomes a concise `[FEATURE]` issue — and jumps to the front of the queue when it would pay for itself within this pass.

Carry the answers forward: each retrospective sets the friction target for the next issue at roughly half the previous one. The same friction appearing twice means stop working symptoms and fix the seam before taking the next issue.

## Finish the pass

Report per issue: PR link, evidence, friction findings, and which seam improvements shipped or were filed. Close with a delta summary — what is now cheaper to build than at the start of the pass.
