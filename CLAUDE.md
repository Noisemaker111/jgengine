# JGengine Agent Guide

The primary engine-development repo: a genre-agnostic, pure-TypeScript game engine SDK plus its agent skills. Published packages live under `packages/*` (npm, AGPL-3.0-only); everything else is private. Repo map, package table, and website story: `README.md`.

## Rules that always apply

- **Work in a worktree.** The primary checkout stays on `main`; every session edits in its own worktree via `EnterWorktree`. Hooks enforce this and walk you through the flow: push + `gh pr create --fill` when the work is real, then queue the merge with `gh pr merge --squash --auto` when it's genuinely done and clean (never over doubt) — GitHub merges it the moment CI goes green (~30s) and deletes the branch itself. Fast-forward the primary checkout when the merge has landed (`git -C <repo root> pull --ff-only` — merging only moves `origin/main`, never the local clone); if you exit before it lands, the next session's pull covers it. After queuing a merge, echo 🚀 in your reply — chat signal only, never on GitHub.
- **Watch CI, don't tight-loop it.** CI finishes in ~30s and runs the same gate you already ran locally. When you want the result, watch the run to completion with a single background `gh pr checks <n> --watch --fail-fast` and get notified — one call, not a loop. Don't decline to check CI, and don't defer to a timer when you can watch it directly. What's banned is the tight loop: never repeatedly call `gh pr checks`/`gh pr view` with `sleep` between polls. Auto-merge means you never have to *block* on green — queue the merge and move on — but actively watching your PR's run is expected, not avoided.
- **Claim an issue before working it.** The moment you start real work on a tracked issue, post a plain comment on it naming the branch — `gh issue comment #N --body "Working on this in claude/<branch>"` — so no one else duplicates the effort. Do it once, up front, before the token-heavy work; a stale 90%-done branch nobody knew about is exactly what this prevents. No branch, no comment: skip it for throwaway spikes that won't touch an issue.
- **Remote sessions arrive off-`main`.** In a cloud session the container checks the primary checkout out onto the assigned task branch, not `main`, and a worktree branched fresh off `origin/main` won't carry that branch's commits (expected — it's why a worktree's CLAUDE.md can differ from the one in session context). After entering your worktree, once the primary's branch is pushed, return it to `main` (`git -C <repo root> switch main`); never let the primary checkout accumulate unpushed local-only commits — a reclaimed container takes them with it (the `warn-unpushed` Stop hook catches this). If a session forgets, the next session's start hook self-heals: a parked primary that is fully pushed and clean is switched back to `main` automatically; a dirty or unpushed one is reported instead of touched, as are stray de-registered worktree folders.
- **A fixed issue must be closed.** When your work resolves a tracked `[FEATURE]` gap issue, close it — never leave a fixed issue open. Put `Closes #N` in the PR body so the merge auto-closes it; if the issue doesn't close on merge (cross-repo, no linking keyword, etc.), close it yourself with `gh issue close #N` and a one-line reason pointing at the merged PR.
- **The user owns release timing.** Merging to `main` can trigger npm publish (`.github/workflows/publish.yml` publishes any `@jgengine/*` version not yet on npm, in dependency order). Never bump a package version to force a release unless asked.
- **Layering is one-directional.** `core` imports nothing. `ws` and `sql` import only core. `react` adds React; `convex` adds Convex + React; `node` adds Node builtins + `ws`; `shell` adds React + three.js and is the only package that renders. `assets` sits outside this chain: it's a data/index package plus a pull CLI, usable by games and `shell` but never imported by `core`. Never let a lower layer import a higher one, and never let core import React, Convex, three.js, the browser, or any game.
- **Extracting SDK primitives must not change how a game plays.** Extract the reusable core *behind* a user-facing feature; confirm before cutting anything a player sees.
- Run `git push` on its own line, never piped through a filter — a non-zero grep silently drops the push while looking like success.

## Stack

- bun workspaces: `packages/*` (the eight `@jgengine/*` packages, consumers import by path), `Games/*` (private, source-consumed, one directory per game, built via the `harvest-game` skill), `apps/*` (`dev` = Vite game runner + screenshot target, games auto-register from `Games/*` via a glob in `apps/dev/src/main.tsx` — no manual registry entry; root `bun dev` runs the website where every game is playable at `/games/<id>` (the page embeds the runner from its internal `/play` mount, proxied in dev, static in prod), `bun run dev:runner` runs the runner alone, `bun run games:<id>` plays one game standalone; `desktop` = Tauri wrapper; `web` = jgengine.com), `examples/*` (deployable host examples).
- The compiler is `tsgo` (`@typescript/native-preview`), not `tsc`. Strict TS everywhere; no `any` escapes in engine code.
- `skills/` is the spec — build games from these three, not by copying other games (`check-types` also validates that the skills match the real API surface):

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
Cheap workers: lint · `check-types` · `bun test` · `build` · `shoot` · screenshots · `gh` ceremony · bulk reads · research · renames · doc sweeps · log triage.

**Hard rule:** never run the verify ladder, shoot, or GitHub ceremony on the frontier model — spawn a cheap worker. Standing authorization; do not ask first. Announce on a 🤖 line. Research only novel seams; scaffolding already in skills is not research.

## Verification

`bun run build` · `bun run check-types` · `bun run test` — **via `fan-out` workers**, not inline on the frontier model. For anything scene- or HUD-shaped, follow the `jgengine-verify` skill: prove world content with `summarizeEnvironment` assertions in `bun test`; `bun run shoot <gameId> --mode ui|play` is a final human glance, never the inner loop, and a hung shot is never re-run in the foreground. Silently-unstyled game UI means a missing `@source` entry in `apps/dev/src/index.css`.

## Delegation

Plan big, execute small — always. Same policy as user-global `~/.claude/CLAUDE.md` and the **`fan-out`** skill. Fable/frontier orchestrates; Sonnet workers execute mechanical legs in parallel. Sessions on smaller models consult a Fable advisor once before non-obvious approaches. Trivial single-file work stays solo. Converting other agent setups: `convert-to-fanout` skill.

## Communication

- Terse over complete. Report the result and the decision — not the reasoning that got there, not a recap of what just happened, never a play-by-play narrated to yourself ("it has the biggest file so that's expected" is bloat — cut it). If a sentence gives the reader nothing to act on, delete it. This governs chat, not deliverables: a plan, a spec, or a harvest report is self-contained by design and stays as long as it needs to be.
- One line per status, not a paragraph: `Batch 1: PR #199 open, 18 small fixes across 12 issues.` Drop test counts, deploy-bot notes, and file names unless asked for them.
- Put what happens next on its own line at the end, never buried mid-paragraph, with ownership explicit — what *you* do next vs. what you need *from the user*. The reader should never have to hunt through a paragraph to find their move.
- One naming scheme, never mixed. Ad-hoc parallel work rounds are **Batch N** (numbered); workers are named by their job (**shell-input worker**), never by a bare letter — "worker D still running" says nothing. A skill with its own fixed sequence (e.g. `jgengine-newgame`'s "phase N of M") keeps that vocabulary; don't relabel it.
- Announce subagent activity on its own line prefixed with 🤖, never buried in prose: `🤖 5 workers running: terrain palette · pointer aim · camera pan · role filter · react hooks`. Report their output as a judged conclusion, not a raw dump.

## Style

- No code comments. Rename, extract, or encode in types instead.
- Dense files: catalogs and content tables stay in one file per domain, not scattered micro-modules.
