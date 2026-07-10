---
name: fan-out
description: >-
  Mechanical work on the frontier model burns 10-50x its cost for the same
  result. Invoke on any turn with a mechanical leg — verify, ship, scouting,
  sweeps. Standing authorization, don't ask.
---

# Cheap workers do the dumb work

Frontier model: plan, design, judge, synthesize.  
Cheap worker: every mechanical leg below, on the cheapest tier that fits.

**Set `model` explicitly on every worker call — Sonnet by default.** Omitting it makes the worker inherit the session model; that is how typecheck re-runs and CI triage have ended up on Opus 4.8. Match tier to the leg (full table in `CLAUDE.md` → Cheap workers): Haiku for pure script/process execution, Sonnet for everything mechanical, and escalate to Opus/Fable only when a leg truly needs the judgment — a Sonnet grinding a too-hard task burns frontier money without frontier results.

**Prompts are briefs, not scripts.** Telegraph style — goal, non-discoverable context, exact return shape, nothing else. Never dictate which tools the worker uses, never paste boilerplate footers or session links into its deliverables, never pad with contingencies it can work out itself. Exchanges are tight both ways: one packed prompt out, one compact judged result back.

**Workers read `CLAUDE.md` and the skills too — never restate them.** Anything the repo docs already define (the ship motion, push retries, merge/green-check steps, tool names) is one reference, not a numbered script; a brief that re-explains it pays for those tokens twice. The whole ship brief is: branch, commit message, PR title + a sentence of body, "run the ship motion." If a brief has step numbers, it's a script — cut it down.

**Don't delegate the trivial.** If the leg is a couple of quick calls or the prompt would outweigh the work, do it inline — spawning a worker has a cost too.

## Always fan these — never run them on the frontier model

- lint · typecheck · test · build
- preview · screenshot · `bun run shoot` · Playwright
- git ceremony once the diff is decided — commit, push, and whatever recovery the push needs (stale refs, prune, restart from origin/main, cherry-pick); the frontier model never grinds through git errors inline
- GitHub ceremony after the decision is made (PR create, comments, issue ops — MCP tools or `gh` where it exists); the whole ship motion (commit → push → PR → merge → 60s green check) is one worker brief
- bulk file reads · codebase scouting · research sweeps · renames · doc sweeps · log triage

Announce workers on a 🤖 line, job-named. Judge their output; never dump raw worker text to the user.

## Never fan these

- engine / product design, API surface, layering, gnarly types
- synthesizing worker results into the user-facing answer
- trivial single-file edits and direct Q&A

## Scouts before deep reads

The frontier model never orients by reading breadth-first — a frontier turn that opens 35 files costs more than a whole fleet of Sonnet scouts. When a task lands in code you haven't mapped, spawn 1–3 Sonnet scouts (the `Explore` agent type fits), each briefed on one angle, each returning a scoped digest: relevant files with `file:line` pointers, key APIs and types, constraints, surprises. Then read deeply only the files the diff will touch. Even two scouts are noise next to a few paragraphs of frontier output; when in doubt, scout.

The one research *don't*: rediscovering scaffolding, HUD idioms, or anything already documented in skills — that's a doc lookup, not research. Codebase scouting is always in bounds.

## Done when

Mechanical work ran on cheap workers; this session only planned and judged.
