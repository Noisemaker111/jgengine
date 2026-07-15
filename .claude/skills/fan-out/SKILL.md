---
name: fan-out
description: Parallelize large or multi-part work across subagents; small stays inline.
---

# Fan out independent work — inline the small stuff

Two ways work fans out. **Multiple independent tasks** ("do all the issues", fix these N bugs, shoot these N games) → one subagent per task, launched together. **One large task with independent legs** → decompose, fan the legs. Everything small or single-threaded stays inline in this session.

Main's job is orchestration: decompose into independent units, launch the batch in one message, judge and synthesize what comes back. Planning, design, and judgment never leave the main loop.

**The trigger is independence, not just size.** ≥2 units that don't need each other's output run in parallel, full stop. Grinding them one at a time in the main loop is the failure mode this skill exists to kill — "do all the issues" is N parallel ships, not a to-do list you work top to bottom.

## What fans out

- **N independent tasks → N subagents → N PRs.** Each issue/bug/feature is its own subagent: branch off `origin/main`, do the work, ship its own PR. "One task, one PR" still holds — per subagent.
- **A large task's parallel legs** — investigate M subsystems, sweep K files, review D dimensions, shoot G games.
- **Substantial mechanical legs** — the verify ladder (gate, tests, build), bulk reads, multi-file renames, doc sweeps, research sweeps.

## Ship in isolation — worktree per task

A subagent that will commit / branch / PR runs in its **own git worktree** so parallel ships never stomp the shared tree: `Agent({ isolation: "worktree", model: "sonnet", ... })`. Each worktree branches off `origin/main`, ships one PR, and auto-cleans. N shipping tasks launch together in one message → N PRs, truly parallel.

The main session stays on its assigned branch and does **not** juggle worktrees — only the shipping subagents do. Because each is alone in its own tree, the shared-tree hazards disappear: a worktree subagent runs its own setup (including `bun install` when the fresh tree needs it) without failing siblings. The "no parallel `bun install`" rule is a *shared-tree* rule — worktree isolation is exactly what lifts it.

## Stays inline — never fan these

- one small thing: a small edit, a small ship, a quick grep, direct Q&A
- pushing/uploading artifacts (screenshots to `pr-shots`, any single-branch commit) — a `git push`, never a subagent, and never one subagent per file
- planning, decomposition, engine/API/layering design, gnarly types
- synthesizing subagent results into the user-facing answer
- waiting on CI or anything else — silence is green, ship and end the turn
- anything a Grep and two file reads would answer

A single small task is one agent: this session. Don't spawn a subagent to do what you'd finish inline before it loaded CLAUDE.md.

## Set `model` explicitly on every subagent

Omitting it inherits the session model. **Haiku** — pure run-and-report legs: lint, typecheck, test, build, the verify ladder, "all the bs testing". **Sonnet** — a substantial ship motion, or diagnosing/fixing what Haiku's run turned up red. **Opus** — scouts and legs needing real judgment. Fable never runs a leg; a Sonnet grinding a too-hard task escalates to Opus, not upward. Screenshots (`shoot`/`drive`) and pushing them to `pr-shots` aren't a fan-out leg — run both directly, no subagent.

The common shape: **Sonnet** worktree subagents run the N parallel ships; **Haiku** runs the verify legs and reports back; **Opus** scouts unmapped territory. Main (frontier) decomposes and judges.

## Prompts are briefs, not scripts

Telegraph style — goal, non-discoverable context, exact return shape, nothing else. Subagents read CLAUDE.md and the skills; never restate them. The whole ship brief is: which issue/task, branch name, PR title + a sentence of body, "run the ship motion." Step numbers mean it's a script — cut it down. One packed prompt out, one compact judged result back.

**Foreground, current turn.** A subagent that backgrounds its command, arms a Monitor, or ends its turn saying "will report back" returns nothing — background children die with the turn. Its final message reports the completed result (PR link, checks verdict), never intent.

**Use the repo commands, never reconstruct the ladder.** `bun run agent:preflight` before generators, `bun run gate` for the full local verdict, `bun run ship:preflight` immediately before commit/push/PR. Never brief a bare `bun test` — unscoped it scans the whole tree unbounded and hangs; brief `bun run test` / `bun run test:all` or an explicit `bun test packages` scope.

## Launch, announce, judge

Independent legs go out **together in one message** as one Batch — serialize only true data dependencies. Announce workers on a 🤖 line, job-named. Judge their output; never dump raw subagent text to the user — synthesize one verdict.

## Done when

Independent tasks ran in parallel subagents (worktree-isolated when they ship), small and single work stayed inline, cheap models ran the mechanical legs, and main kept only planning and judgment.
