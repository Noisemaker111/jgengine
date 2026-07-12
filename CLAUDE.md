# JGengine Agent Guide

The primary engine-development repo: a genre-agnostic, pure-TypeScript game engine SDK plus its agent skills. Published packages live under `packages/*` (npm, AGPL-3.0-only); everything else is private. Repo map, package table, and website story: `README.md`.

## Rules that always apply

- **Every session is its own isolated cloud container.** Work directly on the session's assigned `claude/...` branch — no worktrees, no primary-checkout ceremony, no branch juggling. The container is ephemeral: commit early and push early (`git push -u origin <branch>` on its own line); the `warn-unpushed` Stop hook catches anything stranded.
- **Ship in one motion: push → PR → subscribe → merge, then stay until green.** The local gate (via workers) already proved what CI would — so when the work is genuinely done and clean (never over doubt): push, open the PR (GitHub MCP `create_pull_request`, ready for review), call `subscribe_pr_activity` on it, and squash-merge it immediately (`merge_pull_request`). If GitHub refuses because required checks are still pending, queue it with `enable_pr_auto_merge` (squash). The session is **not done at merge**: it ends only when the PR is merged **and** the Actions run on its merge commit on `main` concluded green. Most CI jobs finish in ~1 minute, but `web-build` (the website build) runs **~6 minutes** — budget the check accordingly: right after the merge, have a cheap worker wait with **one foreground Bash call** — `bun -e 'await Bun.sleep(120000)'` (repeat once or twice for web-build); bare `sleep` is harness-blocked, and a backgrounded wait or Monitor dies with the worker's turn — then read the merge commit's workflow runs in the same turn (`actions_list`/`get_job_logs`). Green → unsubscribe, echo 🚀 in your reply (chat signal only, never on GitHub), stop. Red → diagnose from the failed job's logs and fix forward (`git checkout main && git pull`, fresh `claude/...` branch, fix, repeat the ship motion). Pending past a job's historical duration (compare the last main runs, don't guess) → investigate it as a failure, don't keep waiting. Never arm `send_later` check-ins, scheduled triggers, or remote sessions to babysit CI — that mechanism is retired. One exit before green: a red run whose fix lives outside the repo (npm credentials, GitHub secrets, third-party outage) — report the blocker, hand off the fix as a browser-agent prompt (see Communication), and stop, don't loop on it.
- **Conflicts are the hook's job, not yours.** Never stack new work on merged history — that's where every-session conflicts came from. The session-start hook restarts a clean, already-merged branch from `origin/main` automatically; nothing to check or watch. By hand (rare): `git checkout main && git pull`, then start the next change on a fresh `claude/...` branch — don't leave HEAD on a dead session branch that only matches main by reset.
- **Claim an issue before working it.** The moment you start real work on a tracked issue, post a plain comment on it naming the branch (GitHub MCP `add_issue_comment`, body `Working on this in claude/<branch>`) so no one else duplicates the effort. Do it once, up front, before the token-heavy work; a stale 90%-done branch nobody knew about is exactly what this prevents. No branch, no comment: skip it for throwaway spikes that won't touch an issue.
- **A fixed issue must be closed.** When your work resolves a tracked `[FEATURE]` gap issue, close it — never leave a fixed issue open. Put `Closes #N` in the PR body so the merge auto-closes it; if the issue doesn't close on merge (cross-repo, no linking keyword, etc.), close it yourself (GitHub MCP `issue_write`) with a one-line reason pointing at the merged PR.
- **Issues: telegraph style, three headings, cold reader.** `## Problem` / `## Context` / `## Suggested scope`. Problem's first line = what's missing and why it matters — never buried. Context = bullets a reader without your session needs (what exists, code/issue links). Scope = numbered list at the primitive level, no implementation essays. Same word discipline as chat: if a word gives the reader nothing, cut it.
- **Engine gaps and improvement ideas are never papercuts.** Note them and keep going; file as issues in one pass at session end (or before starting a big implementation).
- **The user owns release timing.** Merging to `main` can trigger npm publish (`.github/workflows/publish.yml` publishes any `@jgengine/*` version not yet on npm, in dependency order). Never bump a package version to force a release unless asked.
- **Layering is one-directional.** `core` imports nothing. `ws` and `sql` import only core. `react` adds React; `convex` adds Convex + React; `node` adds Node builtins + `ws`; `shell` adds React + three.js and is the only package that renders. `assets` sits outside this chain: it's a data/index package plus a pull CLI, usable by games and `shell` but never imported by `core`. Never let a lower layer import a higher one, and never let core import React, Convex, three.js, the browser, or any game.
- **Extracting SDK primitives must not change how a game plays.** Extract the reusable core *behind* a user-facing feature; confirm before cutting anything a player sees.
- **Ports copy behavior and data, never implementation.** When porting or recreating another game (even a permissively-licensed one we credit), the source is a spec: harvest its numbers, tables, layouts, palettes, formulas, and observable feel — then rebuild every system on this engine's primitives. Never transplant its functions, custom renderers, canvas/DOM hacks, or workaround systems; those exist because *their* engine lacked a seam, and copying them imports their debt. If our engine lacks the seam, build it here or file the gap — the test is that the finished code reads like it was born in this repo. Assets under a permissive license may be copied as-is.
- **Ask why before patching a game.** Any time game work needs a fix, a tweak, or a surprising amount of code, find the underlying reason before writing the patch — it's usually a missing engine primitive, a wrong default, or a doc error. Fix that root cause here (or record it as a harvest gap) instead of burying a game-side workaround that hides it; the workaround costs the same code in every future game.
- **Credit borrowed work in the same PR that uses it.** When a game or feature is built from, inspired by, ported from, or prompted by someone else's project, prompt, or design, attribution is not optional. Record it in [`CREDITS.md`](CREDITS.md) **and** surface it to players: the game's on-screen HUD **and** its website page (the `credit` field in `apps/web/src/content/games.ts`, rendered by `apps/web/src/components/Credit.tsx`). Use their real GitHub or X avatar for the face — commit the image when the host is reachable, otherwise reference it by URL (`https://unavatar.io/x/<handle>`) with a graceful fallback.
- **Log papercuts without interrupting active work.** Record every real workflow friction, but never wake the frontier model, race an in-flight ship worker, or create a separate user-visible update just to log one. The worker that encountered it appends the entry before its terminal commit/return; otherwise carry one concise entry into the next safe change. Papercuts are workflow friction only — never engine gaps or improvement ideas. `/papercut` sweeps a whole session — user-triggered only.
- Run `git push` on its own line, never piped through a filter — a non-zero grep silently drops the push while looking like success.

## Design principles

Judge every engine change against three axes — extensibility, modularity, scale — before writing it, not after.

- **Extend through seams, never edits.** New capability arrives through an existing plug-in point — a pluggable transport pipe, a structural interface, a data catalog, an auto-registering glob — not a new branch inside engine code. If the seam is missing, build the seam first, then plug in. An engine file that must be edited every time someone adds a variant is the smell; turn the variant into data or a registration point.
- **Modules are deep, boundaries are narrow.** Each package owns one concern behind the smallest surface that serves it. Cross-layer dependencies are structural, not nominal — `sql` accepts any pool shape instead of importing `pg`, `ws` takes any transport pipe instead of naming one. If implementing a feature requires knowing another module's internals, the boundary is wrong: move the seam, don't reach through it.
- **Build for the next ten games, not this one.** A primitive earns its place in `packages/*` by being genre-agnostic; per-game special cases never enter engine code. Content is data — catalogs, tables, config — so game N+1 is data plus glue, never engine patches. When a design decision is close, pick the option that leaves more seams open.
- **Scale is a default, not a feature.** Core primitives (entities, pools, spatial, feeds, leaderboards) assume many entities, many players, and a hosted multiplayer backend from day one: no unbounded per-frame scans or allocation storms on hot paths, state that serializes cleanly for save/transport, nothing that only works single-player. If it works at 10 entities but not 10,000, it isn't done.
- **Prefer removing a dependency to managing one.** `core`'s zero dependencies is the pattern, not an accident. Every new dependency in a published package is a scaling liability — install weight, version skew, supply chain — and needs a reason the language and existing layers can't give.
- **Engine chrome is composable, never imposed.** The SDK ships defaults, not a mandatory look. No engine feature may pin a fixed-position overlay onto every game (the forced top-right settings gear was the smell) — surface it as a headless component the game *places itself*, inline with its own UI, or an opt-in the game turns on. Games must be able to look nothing alike; if a primitive makes every game wear the same corner widget, the seam is wrong. Give a placement hook, ship a good default *skin*, and let the game decide where — and whether — it appears.

## Stack

- bun workspaces: `packages/*` (the eight `@jgengine/*` packages, consumers import by path), `Games/*` (private, source-consumed, one directory per game, built via the `harvest-game` skill), `apps/*` (`dev` = Vite game runner + screenshot target, games auto-register from `Games/*` via a glob in `apps/dev/src/main.tsx` — no manual registry entry; root `bun dev` runs the website where every game is playable at `/games/<id>` (the page embeds the runner from its internal `/play` mount, proxied in dev, static in prod), `bun run dev:runner` runs the runner alone, `bun run games:<id>` plays one game standalone; `desktop` = Tauri wrapper; `web` = jgengine.com), `examples/*` (deployable host examples).
- New in-repo game: `bun run new:game <id> --name "Title"` scaffolds the full `check-game-shape`-compliant harness (including the required root `games:<id>` script) as a booting game — never hand-copy another game's harness. Menu-gated visual checks: `bun run drive <id> --click "TEXT" --shot name` (see `jgengine-verify`).
- The compiler is `tsgo` (`@typescript/native-preview`), not `tsc`. Strict TS everywhere; no `any` escapes in engine code.
- The engine skills in `.claude/skills/` are the spec — **invoke them** (they auto-surface in every session; never work game code from memory or by copying other games). `check-types` validates they match the real API surface — each domain skill carries a generated `api.md` of its full export surface (`bun run gen:skill-api`; new or changed exports must carry a JSDoc description, pre-existing debt sits in a prune-only baseline at `scripts/api-doc-baseline.json`) — live in `.claude/skills/` (a top-level `skills/` dir is invisible to sessions and fails the gate), and stay model-invocable with ≤15-word descriptions. Start with the router, then read only the domains the intake selects:

  | Skill | Role |
  | --- | --- |
  | `jgengine` | Main skill: intake, foundation (shape, runtime, catalogs), selective domain routing |
  | `jgengine-world` / `jgengine-procedural` | World runtime and generated environments |
  | `jgengine-combat` / `jgengine-gameplay` | Combat and game systems |
  | `jgengine-multiplayer` | Networking, authority, persistence seams |
  | `jgengine-ui` / `jgengine-assets` | Interface and asset surfaces |
  | `jgengine-verify` | Browserless scene gate; shoot last |
- Harvest scope differs by skill: `harvest-game` builds a **minimal probe** to surface gaps fast; `harvest-full-game` builds the complete requested game from `jgengine`'s compact intake. Don't apply "no slices" to a harvest probe, and don't ship a slice when a full build was asked for.
- This is the engine repo: fix engine gaps and doc errors directly here. The only issues filed from inside it are the `[FEATURE]` gap issues from the `harvest-game` skill.

## Cheap workers do the dumb work

Read the **`fan-out`** skill (`.claude/skills/fan-out`). It applies on almost every non-trivial turn in this repo.

Frontier model: plan, design, judge, synthesize (engine design, layering, API surface, gnarly types).  
Cheap workers: lint · `check-types` · `bun test` · `build` · `shoot` · screenshots · git ceremony · GitHub ceremony · bulk reads · codebase scouting · research · renames · doc sweeps · log triage.

**Hard rule:** never run the verify ladder, shoot, git ceremony, or GitHub ceremony on the frontier model. The whole serial ship motion — commit → push → PR → merge → post-merge CI — is one cheap worker brief and one terminal return. The frontier model decides the diff and messages, then remains silent. Standing authorization; do not ask first.

**Frontier cost firewall:** delegated work has a two-message maximum: one optional launch line and one terminal result. The parent does not answer worker progress, tool cards, task-state transitions, GitHub events, PR-open, merge, or individual CI updates. Those are internal state for the cheap worker. If the platform wakes the parent anyway, it emits no prose and starts no new work unless the event is the worker's terminal `PASS`/`FAIL`. One delegation means one parent wake-up.

**Orientation is a scout job.** The frontier model never reads its way into unfamiliar territory — a frontier turn that opens 35 files costs more than a fleet of Sonnet scouts. When a task lands in code you haven't mapped, spawn 1–3 Sonnet scouts, each briefed on one angle and returning a scoped digest (relevant files with `file:line` pointers, key APIs and types, constraints, surprises), then read deeply only the files the diff will touch.

**Pick the model by the intelligence the leg needs — and set it explicitly.** Omitting `model` makes the worker inherit the session model, which is how CI triage and typecheck re-runs have silently landed on Opus 4.8. Sonnet is the default worker; escalate only when the leg genuinely needs more judgment.

| Model | Character | Cost | Reach for it when |
| --- | --- | --- | --- |
| Fable 5 | Smartest and most creative; writes the best code | Very expensive | Orchestration, engine design, the rare leg nothing else can carry |
| Opus 4.8 | Smart, reads intent well, codes well, can be creative | Medium | A leg needs real judgment or user-facing nuance beyond a workhorse |
| Sonnet 5 | Serious workhorse for streamlined, scoped tasks | Affordable | Default for every mechanical leg |
| Haiku 4.5 | Fixed-process executor | Near-free | Running scripts and deterministic process work |

**Write worker prompts like a brief, not a script.** Give the goal, non-discoverable context, and exact return shape. Never restate repo docs. The whole ship brief is branch, commit message, PR title + one sentence, and "run the ship motion."

**Exchanges stay tight in both directions.** A worker returns exactly once: compact `PASS` evidence or the first actionable `FAIL`. No essays, raw successful logs, phase reports, task IDs, or promises.

## Verification

Use `bun run gate` for the complete local verdict. Never reconstruct the ladder with bare `bun test` or separate frontier-run commands. Every gate is hard-bounded by `scripts/guard.ts`. For scene/HUD work, follow `jgengine-verify`; `shoot` is the final glance, not the inner loop.

## Delegation

Plan big, execute small. The orchestrating model plans and judges; cheap workers execute complete mechanical legs. Parallelize independent scouts or edits only. Keep every serial workflow in one worker. Never split gate, commit, PR, merge, and CI merely to surface progress.

## Communication

**Result + decision only.** Reasoning stays internal unless asked.

- **No progress narration.** Never emit phase summaries, "Waiting on…", "Holding for…", "worker is running", "I'll report when…", ownership explanations, or CI estimates. A mid-wait turn has no assistant prose.
- **Do not narrate UI events.** Tool cards and GitHub event cards already show themselves. Never restate "PR is up", "PR merged", "received events", or "CI is running" unless it is the final terminal verdict.
- **At most one final status line:** `PR [#297](https://github.com/Noisemaker111/jgengine/pull/297) merged, CI green 🚀` or one actionable failure.
- Next move: last line, own line, owner explicit.
- **Out-of-repo fixes are handed off as one standalone browser-agent prompt**, not click-by-click instructions.
- Deliverables such as plans and specs are exempt from the terse status rule.

## Style

- No code comments. Rename, extract, or encode in types instead.
- Dense files: catalogs and content tables stay in one file per domain, not scattered micro-modules.
- Agent-invokable skill descriptions: ~10 words (hard cap 15), lead with *why*. Long what/where/how lists never get invoked — triggers and mechanics live in the skill body.
