---
name: fan-out
description: Cost-first delegation — workers only for substantial mechanical legs.
---

# Cheap workers do the dumb work — when there's enough of it

Frontier model: plan, design, judge, synthesize.  
Cheap worker: substantial mechanical legs, on the cheapest tier that fits.

**Cost first — the spawn threshold.** Every worker pays a fixed overhead: its own CLAUDE.md load, orientation, and report. Delegate only when the leg's work clearly exceeds that overhead — a full gate run, a multi-file sweep, a long build. A couple of quick calls, a small doc ship, a single command, or *waiting for anything* stays inline in this session. A whole conversation should use a handful of workers, not one per action; five subagents for a few small edits is the failure mode this rule exists to stop.

**Never spawn a worker to wait.** CI merges arrive as webhook events; run verdicts are one inline `bun -e 'await Bun.sleep(60000)'` (bare `sleep` is harness-blocked) followed by reading the Actions runs. Green checks happen in this session, always.

**Set `model` explicitly on every worker call.** Omitting it makes the worker inherit the session model. Sonnet for mechanical legs — lint, typecheck, test, build, shoot, the verify ladder, a substantial ship motion. Opus for scouts and legs needing real judgment. Haiku for pure script/process execution. Fable never runs a leg — a Sonnet grinding a too-hard task escalates to Opus, not upward.

**Prompts are briefs, not scripts.** Telegraph style — goal, non-discoverable context, exact return shape, nothing else. Short *and* sharp: precision comes from naming the right files, commands, and constraints, not from more words. Never dictate tools, paste boilerplate footers, or pad with contingencies the worker can work out itself. One packed prompt out, one compact judged result back.

**Workers read `CLAUDE.md` and the skills too — never restate them.** The whole ship brief is: branch, commit message, PR title + a sentence of body, "run the ship motion." If a brief has step numbers, it's a script — cut it down.

**Workers run their legs in the foreground, in the current turn.** A worker that backgrounds its command, arms a Monitor, or ends its turn saying "will report back" returns nothing — background children die with the turn. Its final message reports the completed result (PR link, checks verdict), never intent; a worker never hands its leg to a background child of its own. No worker in a parallel batch ever runs `bun install` — a mid-batch install fails every sibling with phantom TS2307s; if needed, it runs alone, first.

**Use the repo commands, never reconstruct the ladder.** `bun run agent:preflight` before generators, `bun run gate` for the full local verdict, `bun run ship:preflight` immediately before commit/push/PR.

**Per-item sweep briefs say "do these yourself — do not delegate."** Otherwise a worker treats the list as an orchestration job and fans out N sub-workers.

**Independent legs launch in parallel, never in sequence.** Everything that doesn't need another leg's output goes out together in one message as one Batch. Serialize only true data dependencies.

## Worth a worker (when substantial)

- the verify ladder — gate, tests, build — on a real diff
- `bun run shoot` · Playwright · screenshot rounds
- a ship motion with a big diff or gnarly push recovery
- bulk file reads · multi-file renames · doc sweeps · log triage · research sweeps

Announce workers on a 🤖 line, job-named. Judge their output; never dump raw worker text to the user.

## Never fan these

- engine / product design, API surface, layering, gnarly types
- synthesizing worker results into the user-facing answer
- small edits, small ships, direct Q&A, waiting on CI or anything else
- anything a Grep and two file reads would answer

## Scouts — a look first, a scout rarely

Before any scout: take the little look inline — a Grep, a Glob, two file reads. That answers most orientation questions for near-zero cost. Reserve scouts for genuinely unmapped territory where orienting would mean reading many unfamiliar files (think 10+). Default is **one** Opus scout (the `Explore` agent type fits); multiple only for truly separate angles. Digest shape: relevant files with `file:line` pointers, key APIs and types, constraints, surprises. Then read deeply only the files the diff will touch.

Never scout for scaffolding, HUD idioms, or anything already documented in skills — that's a doc lookup.

## Done when

Heavy mechanical work ran on cheap workers, small work stayed inline, and the worker count stayed small.
