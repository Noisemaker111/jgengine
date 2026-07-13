---
name: fan-out
description: Invoke on any mechanical leg — verify, ship, scout, sweep. Standing authorization.
---

# Cheap workers do the dumb work

Frontier model: plan, design, judge, synthesize.  
Cheap worker: every mechanical leg below, on the cheapest tier that fits.

**Set `model` explicitly on every worker call.** Omitting it makes the worker inherit the session model; that is how typecheck re-runs and CI triage have ended up on frontier models. Sonnet for every mechanical leg — lint, typecheck, test, build, shoot, the verify ladder, the whole ship motion. **Opus for scouts** and any leg needing real judgment. Haiku for pure script/process execution. Fable never runs a leg — a Sonnet grinding a too-hard task escalates to Opus, not upward.

**Prompts are briefs, not scripts.** Telegraph style — goal, non-discoverable context, exact return shape, nothing else. Short *and* sharp: precision comes from naming the right files, commands, and constraints, not from more words. Never dictate which tools the worker uses, never paste boilerplate footers or session links into its deliverables, never pad with contingencies it can work out itself. Exchanges are tight both ways: one packed prompt out, one compact judged result back.

**Workers read `CLAUDE.md` and the skills too — never restate them.** Anything the repo docs already define (the ship motion, push retries, merge/green-check steps, tool names) is one reference, not a numbered script; a brief that re-explains it pays for those tokens twice. The whole ship brief is: branch, commit message, PR title + a sentence of body, "run the ship motion." If a brief has step numbers, it's a script — cut it down.

**Don't delegate the trivial.** If the leg is a couple of quick calls or the prompt would outweigh the work, do it inline — spawning a worker has a cost too.

**Workers run their legs in the foreground, in the current turn.** A worker that backgrounds its command, arms a Monitor, or ends its turn saying "running in background / will report back" returns nothing — background children die with the turn. That final message must report the completed result (PR link, merge state, CI verdict), never intent. Nested delegation obeys the same rule: a worker never hands its leg to a background child of its own. For the ~60s green-check wait, bare `sleep` is blocked by the harness — use one foreground Bash call that embeds the wait: `bun -e 'await Bun.sleep(60000)'`, then read the Actions runs in the same turn. And no worker in a parallel batch ever runs `bun install` — a mid-batch install leaves `node_modules` half-extracted and fails every sibling with phantom TS2307s; if an install is needed, it runs alone, before the batch launches.

**Use the repo commands, never reconstruct the ladder.** Before generators or hand-rolled verify steps, run `bun run agent:preflight` (catches a half-finished install or malformed `package.json` early). For the full local verdict use `bun run gate`, not a hand-assembled `build && check-types && test` chain. Immediately before commit/push/PR, run `bun run ship:preflight` — it rejects a dirty tree, a branch not based on current `origin/main`, or a no-op diff before the ship motion wastes a PR on it.

**Per-item sweep briefs say "do these yourself — do not delegate."** A single worker given N small edits will otherwise treat the list as an orchestration job and recursively fan out N sub-workers; the line belongs in every multi-item brief.

**Independent legs launch in parallel, never in sequence.** Before spawning anything, split the turn into legs and sort them: everything that doesn't need another leg's output goes out together in one message as one Batch — lint + typecheck + test, scouts on different angles, doc sweep alongside a build. Serialize only true data dependencies (fix before verify, verify before ship). Spawning one worker, waiting, then spawning the next pays wall-clock for nothing and is the same smell as step numbers in a brief.

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

The frontier model never orients by reading breadth-first — a frontier turn that opens 35 files costs more than a whole fleet of scouts. When a task lands in code you haven't mapped, spawn 1–3 **Opus** scouts (the `Explore` agent type fits; scouting is a judgment read, so Opus, not Sonnet), each briefed on one angle, each returning a scoped digest: relevant files with `file:line` pointers, key APIs and types, constraints, surprises. Then read deeply only the files the diff will touch. Even two scouts are noise next to a few paragraphs of frontier output; when in doubt, scout.

The one research *don't*: rediscovering scaffolding, HUD idioms, or anything already documented in skills — that's a doc lookup, not research. Codebase scouting is always in bounds.

## Done when

Mechanical work ran on cheap workers; this session only planned and judged.
