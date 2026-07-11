# JGengine Agent Guide

The primary engine-development repo: a genre-agnostic, pure-TypeScript game engine SDK plus its agent skills. Published packages live under `packages/*` (npm, AGPL-3.0-only); everything else is private. Repo map, package table, and website story: `README.md`.

## Rules that always apply

- **Every session is its own isolated cloud container.** Work directly on the session's assigned `claude/...` branch — no worktrees, no primary-checkout ceremony, no branch juggling. The container is ephemeral: commit early and push early (`git push -u origin <branch>` on its own line); the `warn-unpushed` Stop hook catches anything stranded.
- **Ship in one motion: push → PR → subscribe → merge, then stay until green.** The local gate (via workers) already proved what CI would — so when the work is genuinely done and clean (never over doubt): push, open the PR (GitHub MCP `create_pull_request`, ready for review), call `subscribe_pr_activity` on it, and squash-merge it immediately (`merge_pull_request`). If GitHub refuses because required checks are still pending, queue it with `enable_pr_auto_merge` (squash). The session is **not done at merge**: it ends only when the PR is merged **and** the Actions run on its merge commit on `main` concluded green. Nothing in this repo's Actions — CI or the website deploy — takes longer than about a minute, so verify **now**, not later: right after the merge, have a cheap worker sleep ~60s **in the foreground** — a backgrounded sleep dies with the worker's turn — then read the merge commit's workflow runs (`actions_list`/`get_job_logs`). Green → unsubscribe, echo 🚀 in your reply (chat signal only, never on GitHub), stop. Red → diagnose from the failed job's logs and fix forward (`git checkout main && git pull`, fresh `claude/...` branch, fix, repeat the ship motion). Still pending after a second 60s look → 99.9% of the time something is wrong; investigate it as a failure, don't keep waiting. Never arm `send_later` check-ins, scheduled triggers, or remote sessions to babysit CI — that mechanism is retired; the one 60s worker check is the whole mechanism. One exit before green: a red run whose fix lives outside the repo (npm credentials, GitHub secrets, third-party outage) — report the blocker, hand off the fix as a browser-agent prompt (see Communication), and stop, don't loop on it.
- **Conflicts are the hook's job, not yours.** Never stack new work on merged history — that's where every-session conflicts came from. The session-start hook restarts a clean, already-merged branch from `origin/main` automatically; nothing to check or watch. By hand (rare): `git checkout main && git pull`, then start the next change on a fresh `claude/...` branch — don't leave HEAD on a dead session branch that only matches main by reset.
- **Claim an issue before working it.** The moment you start real work on a tracked issue, post a plain comment on it naming the branch (GitHub MCP `add_issue_comment`, body `Working on this in claude/<branch>`) so no one else duplicates the effort. Do it once, up front, before the token-heavy work; a stale 90%-done branch nobody knew about is exactly what this prevents. No branch, no comment: skip it for throwaway spikes that won't touch an issue.
- **A fixed issue must be closed.** When your work resolves a tracked `[FEATURE]` gap issue, close it — never leave a fixed issue open. Put `Closes #N` in the PR body so the merge auto-closes it; if the issue doesn't close on merge (cross-repo, no linking keyword, etc.), close it yourself (GitHub MCP `issue_write`) with a one-line reason pointing at the merged PR.
- **Issues: telegraph style, three headings, cold reader.** `## Problem` / `## Context` / `## Suggested scope`. Problem's first line = what's missing and why it matters — never buried. Context = bullets a reader without your session needs (what exists, code/issue links). Scope = numbered list at the primitive level, no implementation essays. Same word discipline as chat: if a word gives the reader nothing, cut it.
- **Engine gaps and improvement ideas are never papercuts.** Note them and keep going; file as issues in one pass at session end (or before starting a big implementation).
- **The user owns release timing.** Merging to `main` can trigger npm publish (`.github/workflows/publish.yml` publishes any `@jgengine/*` version not yet on npm, in dependency order). Never bump a package version to force a release unless asked.
- **Layering is one-directional.** `core` imports nothing. `ws` and `sql` import only core. `react` adds React; `convex` adds Convex + React; `node` adds Node builtins + `ws`; `shell` adds React + three.js and is the only package that renders. `assets` sits outside this chain: it's a data/index package plus a pull CLI, usable by games and `shell` but never imported by `core`. Never let a lower layer import a higher one, and never let core import React, Convex, three.js, the browser, or any game.
- **Extracting SDK primitives must not change how a game plays.** Extract the reusable core *behind* a user-facing feature; confirm before cutting anything a player sees.
- **Ask why before patching a game.** Any time game work needs a fix, a tweak, or a surprising amount of code, find the underlying reason before writing the patch — it's usually a missing engine primitive, a wrong default, or a doc error. Fix that root cause here (or record it as a harvest gap) instead of burying a game-side workaround that hides it; the workaround costs the same code in every future game.
- **Credit borrowed work in the same PR that uses it.** When a game or feature is built from, inspired by, ported from, or prompted by someone else's project, prompt, or design, attribution is not optional. Record it in [`CREDITS.md`](CREDITS.md) **and** surface it to players: the game's on-screen HUD **and** its website page (the `credit` field in `apps/web/src/content/games.ts`, rendered by `apps/web/src/components/Credit.tsx`). Use their real GitHub or X avatar for the face — commit the image when the host is reachable, otherwise reference it by URL (`https://unavatar.io/x/<handle>`) with a graceful fallback.
- **Log papercuts the moment they happen — no exceptions.** Any small friction (retried call, dead-end command, misleading error, flaky worker, wording that steered you wrong) gets `bun run papercut -m <model> "doing X → Y got in the way"` right then. One command, zero ceremony: the entry rides along in whatever ships next — never skip one because it "would need its own PR", the work is mid-flight, or it feels too small. Papercuts are **workflow friction only** — never engine gaps or improvement ideas; those follow the issue rule above. Not `CHANGELOG.md` (what shipped), not an issue (real bugs). `/papercut` sweeps a whole session — user-triggered only.
- Run `git push` on its own line, never piped through a filter — a non-zero grep silently drops the push while looking like success.

## Design principles

Judge every engine change against three axes — extensibility, modularity, scale — before writing it, not after.

- **Extend through seams, never edits.** New capability arrives through an existing plug-in point — a pluggable transport pipe, a structural interface, a data catalog, an auto-registering glob — not a new branch inside engine code. If the seam is missing, build the seam first, then plug in. An engine file that must be edited every time someone adds a variant is the smell; turn the variant into data or a registration point.
- **Modules are deep, boundaries are narrow.** Each package owns one concern behind the smallest surface that serves it. Cross-layer dependencies are structural, not nominal — `sql` accepts any pool shape instead of importing `pg`, `ws` takes any transport pipe instead of naming one. If implementing a feature requires knowing another module's internals, the boundary is wrong: move the seam, don't reach through it.
- **Build for the next ten games, not this one.** A primitive earns its place in `packages/*` by being genre-agnostic; per-game special cases never enter engine code. Content is data — catalogs, tables, config — so game N+1 is data plus glue, never engine patches. When a design decision is close, pick the option that leaves more seams open.
- **Scale is a default, not a feature.** Core primitives (entities, pools, spatial, feeds, leaderboards) assume many entities, many players, and a hosted multiplayer backend from day one: no unbounded per-frame scans or allocation storms on hot paths, state that serializes cleanly for save/transport, nothing that only works single-player. If it works at 10 entities but not 10,000, it isn't done.
- **Prefer removing a dependency to managing one.** `core`'s zero dependencies is the pattern, not an accident. Every new dependency in a published package is a scaling liability — install weight, version skew, supply chain — and needs a reason the language and existing layers can't give.

## Stack

- bun workspaces: `packages/*` (the eight `@jgengine/*` packages, consumers import by path), `Games/*` (private, source-consumed, one directory per game, built via the `harvest-game` skill), `apps/*` (`dev` = Vite game runner + screenshot target, games auto-register from `Games/*` via a glob in `apps/dev/src/main.tsx` — no manual registry entry; root `bun dev` runs the website where every game is playable at `/games/<id>` (the page embeds the runner from its internal `/play` mount, proxied in dev, static in prod), `bun run dev:runner` runs the runner alone, `bun run games:<id>` plays one game standalone; `desktop` = Tauri wrapper; `web` = jgengine.com), `examples/*` (deployable host examples).
- The compiler is `tsgo` (`@typescript/native-preview`), not `tsc`. Strict TS everywhere; no `any` escapes in engine code.
- The three engine skills in `.claude/skills/` are the spec — **invoke them** (they auto-surface in every session; never work game code from memory or by copying other games). `check-types` validates they match the real API surface, live in `.claude/skills/` (a top-level `skills/` dir is invisible to sessions and fails the gate), and stay model-invocable with ≤15-word descriptions:

  | Skill | Role |
  | --- | --- |
  | `jgengine-newgame` | Blueprint + phased full build |
  | `jgengine-api` | Engine surface, UI quality bar, asset sourcing |
  | `jgengine-verify` | Browserless scene gate; shoot last |
- Harvest scope differs by skill: `harvest-game` builds a **minimal probe** to surface gaps fast; `harvest-full-game` / `jgengine-newgame` build the **full blueprint, no half systems**. Don't apply "no slices" to a harvest probe, and don't ship a slice when a full build was asked for.
- This is the engine repo: fix engine gaps and doc errors directly here. The only issues filed from inside it are the `[FEATURE]` gap issues from the `harvest-game` skill.

## Cheap workers do the dumb work

Read the **`fan-out`** skill (`.claude/skills/fan-out`). It applies on almost every non-trivial turn in this repo.

Frontier model: plan, design, judge, synthesize (engine design, layering, API surface, gnarly types).  
Cheap workers: lint · `check-types` · `bun test` · `build` · `shoot` · screenshots · git ceremony (commit, push, stale-ref/force-with-lease recovery, branch restarts, cherry-picks) · GitHub ceremony · bulk reads · codebase scouting · research · renames · doc sweeps · log triage.

**Hard rule:** never run the verify ladder, shoot, git ceremony, or GitHub ceremony on the frontier model — spawn a cheap worker. The whole ship motion (commit → push → PR → merge → 60s green check), including any push recovery it hits along the way, is one light worker brief; the frontier model only decides the diff and the messages. Standing authorization; do not ask first. Announce on a 🤖 line.

**Orientation is a scout job.** The frontier model never reads its way into unfamiliar territory — a frontier turn that opens 35 files costs more than a fleet of Sonnet scouts. When a task lands in code you haven't mapped, spawn 1–3 Sonnet scouts, each briefed on one angle and returning a scoped digest (relevant files with `file:line` pointers, key APIs and types, constraints, surprises), then read deeply only the files the diff will touch. The one research *don't* is rediscovering scaffolding already documented in skills — that's a doc lookup, not research; codebase scouting is always in bounds.

**Pick the model by the intelligence the leg needs — and set it explicitly.** Omitting `model` makes the worker inherit the session model, which is how CI triage and typecheck re-runs have silently landed on Opus 4.8. Sonnet is the default worker; escalate a leg only when it genuinely needs more brain, and never let a mechanical leg inherit a frontier model.

| Model | Character | Cost | Reach for it when |
| --- | --- | --- | --- |
| Fable 5 | Smartest and most creative; writes the best code | Very expensive | Orchestration, engine design, the rare leg nothing else can carry |
| Opus 4.8 | Smart, reads intent well, codes well, can be creative | Medium | A leg needs real judgment or user-facing nuance beyond a workhorse |
| Sonnet 5 | Nearly Opus-smart *given a well-written prompt*; the serious workhorse for streamlined, well-scoped, not-long tasks; weakest coder of the three above | Affordable — but grinding a too-hard task can cost Fable money; escalate instead of letting it churn | The default for every mechanical leg |
| Haiku 4.5 | Not smart; never trust it with code | Near-free | Running scripts and fixed processes where the worker just executes |

**Write worker prompts like a brief, not a script.** Give the goal, the context the worker can't discover itself, and the exact return shape — then stop. Never tell a worker which tools to call, paste in boilerplate footers or session links, or pad the prompt with contingency instructions it can figure out on its own. And don't delegate at all when the task is a couple of quick calls — if writing the prompt costs more than doing the work, do it inline.

**Never restate this file in a brief.** Workers load `CLAUDE.md` and the skills themselves; re-explaining the ship motion, push retries, or tool names pays for those tokens twice. A ship brief carries only what the frontier decides — branch, commit message, PR title + a sentence of body — plus "run the ship motion." Step numbers in a brief mean it's become a script.

**Exchanges stay tight in both directions.** A worker gets one well-packed prompt and returns a judged, compact result — never essays round-tripped. The same discipline applies upward: a Sonnet session consults its Fable advisor with one good-sized prompt for implementation guidance, not paragraphs of story shuttled back and forth. Everyone in the fan-out is a worker; write like one.

## Verification

`bun run build` · `bun run check-types` · `bun run test` — **via `fan-out` workers**, not inline on the frontier model. Every gate is hard-bounded by `scripts/guard.ts` (kills the whole process tree, exits 124); `shoot` also carries an internal watchdog and CI jobs carry `timeout-minutes`. A hang is now a fast, loud 124 — on one, diagnose the cause; never re-run and wait, never raise the budget to paper over it. For anything scene- or HUD-shaped, follow the `jgengine-verify` skill: prove world content with `summarizeEnvironment` assertions in `bun test`; `bun run shoot <gameId> --mode ui|play` is a final human glance, never the inner loop, and a hung shot is never re-run in the foreground. Silently-unstyled game UI means a missing `@source` entry in `apps/dev/src/index.css`.

## Delegation

Plan big, execute small — always. Same policy as user-global `~/.claude/CLAUDE.md` and the **`fan-out`** skill. The orchestrating model plans and judges; workers execute mechanical legs in parallel on the cheapest tier that fits (see the model table above — Sonnet by default, explicit `model`, never inherited). Sessions on smaller models consult a Fable advisor once before non-obvious approaches — one tight prompt, not a correspondence. Trivial single-file work stays solo. Converting other agent setups: `convert-to-fanout` skill.

## Communication

**Telegraph style, everywhere** — chat, statuses, quips, worker briefs. Fragments beat sentences; grammar is optional, information is not. Cut courtesies, hedges, recaps, transitions, play-by-play, "as expected" notes. Target ~20% of polite prose: `Waiting on Actions, will react` — not "I'll report as soon as the worker returns." If a word gives the reader nothing, cut it.

- Result + decision only. Reasoning stays internal unless asked.
- Status = one line: `PR [#297](https://github.com/Noisemaker111/jgengine/pull/297) merged, CI green 🚀`. PR/issue numbers **always hyperlinked**.
- Next move: last line, own line, owner explicit — `Next: you add VERCEL_TOKEN` vs `Next: shipping Batch 2`.
- **Out-of-repo fixes are handed off as a prompt, never as instructions.** When the user's next move lives outside the repo (dashboard settings, secrets, tokens, DNS, third-party accounts), don't give them steps — give them a fenced code block containing one standalone prompt they can paste into their browser agent. The agent is smart but knows nothing about this repo: state the goal, every fact it can't discover (repo/org name, exact secret or setting names, what the value is for, how to verify done), and no click-by-click steps. One block, copy-paste ready, nothing else required from the user.
- One naming scheme, never mixed. Parallel rounds are **Batch N**; workers job-named (**shell-input worker**), never lettered. Skills with fixed sequences keep their own phase vocabulary.
- Subagents announced on a 🤖 line, never buried in prose: `🤖 5 workers: terrain palette · pointer aim · camera pan`. Their output comes back as a judged conclusion, not a dump.
- Deliverables are exempt: a plan, spec, or harvest report is self-contained and runs as long as it needs.

## Style

- No code comments. Rename, extract, or encode in types instead.
- Dense files: catalogs and content tables stay in one file per domain, not scattered micro-modules.
- Agent-invokable skill descriptions: ~10 words (hard cap 15), lead with *why*. Long what/where/how lists never get invoked — triggers and mechanics live in the skill body.
