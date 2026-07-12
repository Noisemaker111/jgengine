---
name: fan-out
description: Invoke on any mechanical leg — verify, ship, scout, sweep. Standing authorization.
---

# Cheap workers do the dumb work

Frontier model: plan, design, judge, synthesize.  
Cheap worker: every mechanical leg below, on the cheapest tier that fits.

**Set `model` explicitly on every worker call — Sonnet by default.** Omitting it makes the worker inherit the session model; that is how typecheck re-runs and CI triage have ended up on Opus 4.8. Match tier to the leg (full table in `CLAUDE.md` → Cheap workers): Haiku for pure script/process execution, Sonnet for everything mechanical, and escalate to Opus/Fable only when a leg truly needs the judgment — a Sonnet grinding a too-hard task burns frontier money without frontier results.

**Prompts are briefs, not scripts.** Telegraph style — goal, non-discoverable context, exact return shape, nothing else. Never dictate which tools the worker uses, never paste boilerplate footers or session links into its deliverables, never pad with contingencies it can work out itself. Exchanges are tight both ways: one packed prompt out, one compact judged result back.

**Workers read `CLAUDE.md` and the skills too — never restate them.** Anything the repo docs already define (the ship motion, push retries, merge/green-check steps, tool names) is one reference, not a numbered script; a brief that re-explains it pays for those tokens twice. The whole ship brief is: branch, commit message, PR title + a sentence of body, "run the ship motion." If a brief has step numbers, it is a script — cut it down.

**Don't delegate the trivial.** If the leg is a couple of quick calls or the prompt would outweigh the work, do it inline — spawning a worker has a cost too.

## Frontier cost firewall

**The expensive parent gets at most two user-visible messages for delegated work:** one optional launch line and one terminal result. After launch, absolute silence until the assigned leg is complete or has one actionable failure. No phase recaps, ownership explanations, progress estimates, or promises to report later.

**One delegation means one parent wake-up.** The parent must not consume or answer intermediate worker messages. Tool cards, task-state changes, GitHub subscription events, PR creation, merge events, and individual CI completions are not conversational milestones. They remain inside the cheap worker's leg. If the platform wakes the parent anyway, the parent emits no prose and performs no new work unless the event is the worker's terminal `PASS`/`FAIL`.

**A ship motion is one worker and one return.** Commit → push → PR → merge → post-merge CI is one serial mechanical leg, never multiple tasks. PR-open and PR-merged are partial states, not reportable results when CI is part of the assignment. Do not launch a second wait/check worker because an event arrived; the original worker owns the full motion.

**No mid-flight housekeeping.** Do not log papercuts, edit docs, inspect unrelated state, or start another mechanical task while a worker owns the worktree or ship motion. The worker records relevant papercuts before its terminal commit/return, or reports one concise entry for the next safe change. This prevents git races and extra frontier turns.

## Worker execution contract

**Workers run their legs in the foreground, in the current turn.** A worker that backgrounds its command, arms a Monitor, or ends its turn saying "running in background / will report back" returns nothing — background children die with the turn. Nested delegation obeys the same rule: a worker does the assigned leg itself and never hands it to a child. For the green-check wait, bare `sleep` is blocked by the harness — use one foreground Bash call that embeds the wait, then read Actions in the same turn. No worker in a parallel batch runs `bun install`; install once before the batch.

**Mechanical return shape is mandatory and single-shot.** Return exactly once:

- `PASS` — concise terminal evidence: command set, exit status, commit SHA, PR link, merge state, CI verdict as applicable.
- `FAIL` — first actionable failure plus only the diagnostics needed to fix it.

A response containing intent, partial progress, a task id, raw successful logs, or a background handoff is a failed leg. Do not redispatch until branch, worktree, remote, task, PR, and CI state have been inspected; the original worker may already have completed.

**Use the repo commands, never reconstruct the ladder.** Before generators or verification, run `bun run agent:preflight`. For the full local verdict, run only `bun run gate`. Immediately before commit/push/PR, run `bun run ship:preflight`; it rejects dirty trees, stale-main ancestry, and no-op branches.

**Per-item sweep briefs say "do these yourself — do not delegate."** A single worker given N small edits will otherwise treat the list as an orchestration job and recursively fan out N sub-workers; the line belongs in every multi-item brief.

**Parallelize only independent completed-result legs.** Scouts on separate areas may run together. A serial workflow such as gate → commit → PR → merge → CI stays one worker. Never split serial stages merely to surface progress sooner.

## Always fan these — never run them on the frontier model

- lint · typecheck · test · build
- preview · screenshot · `bun run shoot` · Playwright
- git ceremony once the diff is decided — commit, push, and whatever recovery the push needs
- GitHub ceremony after the decision is made; the whole ship motion is one worker brief
- bulk file reads · codebase scouting · research sweeps · renames · doc sweeps · log triage

Announce workers on one 🤖 line before launch, or omit the announcement when the action card already makes it obvious. After launch, silence until the combined terminal result or first actionable failure. Never narrate a tool card or restate an event the UI already shows.

## Never fan these

- engine / product design, API surface, layering, gnarly types
- synthesizing worker results into the user-facing answer
- trivial single-file edits and direct Q&A

## Scouts before deep reads

The frontier model never orients by reading breadth-first — a frontier turn that opens 35 files costs more than a whole fleet of Sonnet scouts. When a task lands in code you haven't mapped, spawn 1–3 Sonnet scouts, each briefed on one angle and returning a scoped digest: relevant files with `file:line` pointers, key APIs and types, constraints, surprises. Then read deeply only the files the diff will touch.

The one research *don't*: rediscovering scaffolding, HUD idioms, or anything already documented in skills — that's a doc lookup, not research. Codebase scouting is always in bounds.

## Done when

Mechanical work ran on cheap workers; each serial leg returned once with terminal evidence; the frontier model consumed no intermediate updates, reacted to no progress events, and only planned and judged.
