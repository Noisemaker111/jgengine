# JGengine Agent Guide

The primary engine-development repo: a genre-agnostic, pure-TypeScript game engine SDK plus its agent skills. Published packages live under `packages/*` (npm, AGPL-3.0-only); everything else is private. Repo map, package table, and website story: `README.md`.

## Rules that always apply

- **Every session is its own isolated cloud container.** Work directly on the session's assigned `claude/...` branch — no worktrees, no primary-checkout ceremony, no branch juggling. The container is ephemeral: commit early and push early (`git push -u origin <branch>` on its own line); the `warn-unpushed` Stop hook catches anything stranded. When the work is real, push and open a PR (GitHub MCP `create_pull_request`, ready for review), then queue the merge with squash auto-merge (`enable_pr_auto_merge`) when it's genuinely done and clean (never over doubt) — GitHub merges it the moment CI goes green and deletes the branch itself. After queuing a merge, echo 🚀 in your reply — chat signal only, never on GitHub.
- **Never stack new work on merged history.** A squash-merged branch is finished — committing on top of its old commits is what causes the every-session merge conflicts. The session-start hook self-heals: a clean branch whose content already landed in `origin/main` is restarted from `origin/main` automatically. Doing it by hand: `git fetch origin main && git reset --hard origin/main` on the same branch name, then push with `--force-with-lease`.
- **Watch CI through the PR subscription, don't poll it.** CI runs the same gate you already ran locally. After opening a PR, call `subscribe_pr_activity` — review comments and CI failures arrive as events that wake the session. Never poll with repeated status checks and `sleep` between them. Auto-merge means you never have to *block* on green — queue the merge and move on.
- **Claim an issue before working it.** The moment you start real work on a tracked issue, post a plain comment on it naming the branch (GitHub MCP `add_issue_comment`, body `Working on this in claude/<branch>`) so no one else duplicates the effort. Do it once, up front, before the token-heavy work; a stale 90%-done branch nobody knew about is exactly what this prevents. No branch, no comment: skip it for throwaway spikes that won't touch an issue.
- **A fixed issue must be closed.** When your work resolves a tracked `[FEATURE]` gap issue, close it — never leave a fixed issue open. Put `Closes #N` in the PR body so the merge auto-closes it; if the issue doesn't close on merge (cross-repo, no linking keyword, etc.), close it yourself (GitHub MCP `issue_write`) with a one-line reason pointing at the merged PR.
- **The user owns release timing.** Merging to `main` can trigger npm publish (`.github/workflows/publish.yml` publishes any `@jgengine/*` version not yet on npm, in dependency order). Never bump a package version to force a release unless asked.
- **Layering is one-directional.** `core` imports nothing. `ws` and `sql` import only core. `react` adds React; `convex` adds Convex + React; `node` adds Node builtins + `ws`; `shell` adds React + three.js and is the only package that renders. `assets` sits outside this chain: it's a data/index package plus a pull CLI, usable by games and `shell` but never imported by `core`. Never let a lower layer import a higher one, and never let core import React, Convex, three.js, the browser, or any game.
- **Extracting SDK primitives must not change how a game plays.** Extract the reusable core *behind* a user-facing feature; confirm before cutting anything a player sees.
- **Ask why before patching a game.** Any time game work needs a fix, a tweak, or a surprising amount of code, find the underlying reason before writing the patch — it's usually a missing engine primitive, a wrong default, or a doc error. Fix that root cause here (or record it as a harvest gap) instead of burying a game-side workaround that hides it; the workaround costs the same code in every future game.
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
Cheap workers: lint · `check-types` · `bun test` · `build` · `shoot` · screenshots · GitHub ceremony · bulk reads · research · renames · doc sweeps · log triage.

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
