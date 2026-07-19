# @jgengine-apps/web — jgengine.com

The landing page for JGengine and the front door for agents. TanStack Start (SSR) on **Vercel** via Nitro.

- **Humans** get a site that *runs the engine instead of describing it*: the landing (`/` — a live three.js city generated in-tab by `@jgengine/core`'s `generateCity`, regrown per rotating pitch from a shareable `?seed=`), **Playground** (`/playground` — the same generator on sliders, rendered as an orbitable 3D city), **Capabilities** (`/capabilities` — live specimens driven by real core functions beside the code that imports them, plus every system shown as the real code you write), **Why JGengine** (`/why` — the honest pitch, pros/cons, a hand-rolled-vs-authored diff), and **Editor** (`/editor` — the standalone 3D scene editor). The client-only three.js modules live in [`src/live/`](src/live) and are loaded via dynamic `import()` from `useEffect` so SSR never sees them; `mount.ts` owns renderer lifecycle (DPR cap, offscreen/hidden RAF pause, reduced-motion, disposal) and `cityScene.ts` turns `GeneratedCity` output into merged street ribbons, grow-shader buildings, and traffic.
- **Humans** have one interface: `Make a game that … with jgengine` (to any coding agent). The site shows that prompt; the CLI is for agents underneath. Each page markets *and* documents — code snippets are real API, not decoration.
- **Agents** get a machine-readable front door: `/llms.txt` (llmstxt.org index — what JGengine is, the `npx jgengine create` quickstart, the never-clone-the-repo rule) and `/llms-full.txt` (the full brief: CLI commands, packages, layering, verification). Both are server routes built from [`src/lib/agentDocs.ts`](src/lib/agentDocs.ts) over the same [`site.ts`](src/lib/site.ts) constants the marketing pages use, so they cannot drift; `robots.txt` points crawlers at `/llms.txt`. (They are `.txt` routes because Vite's dev static middleware intercepts `.md` URLs before SSR.)

## Pages market and document at once

The marketing pages ([`src/routes/why.tsx`](src/routes/why.tsx), [`capabilities.tsx`](src/routes/capabilities.tsx), [`editor.tsx`](src/routes/editor.tsx)) sell the engine while showing the actual primitives — worlds, entities, combat, netcode, authored scenes. Shared surfaces (`CodeBlock`, `VersusBlock`, `ProsCons`, `FeatureCard`) live in [`src/components/marketing.tsx`](src/components/marketing.tsx). Keep snippets grounded in the real API so the pages stay honest as the engine moves.

Because the site ships with the engine, **any push to `main` that touches `.claude/skills/` or `packages/` rebuilds and redeploys** (the paths are listed in [`vercel.json`](vercel.json)'s `ignoreCommand`). Shipping an engine change *is* a website update — there is no separate content step.

### Games are playable on the site (`/games`, `/play`)

`vite build` builds the game player: the `games-player` plugin in [`vite.config.ts`](vite.config.ts) shells out to `apps/dev`'s `build:site` script into `public/play`, and the `/api/github-*` server routes back games that render real GitHub data. The games page (`/games`) and the per-game pages (`/games/<id>`) list every `Games/*` game — ids come from the `virtual:jgengine-games` module resolved in `vite.config.ts` — and embed the runner; both are linked from the site header.

In dev there is no second server and no proxy: the `games-player-dev` plugin serves the same static build from `public/play`, restored instantly from the content-hash cache ([`scripts/games-player-cache.ts`](../../scripts/games-player-cache.ts)) when game and engine sources are unchanged, rebuilt in the background otherwise while `/play` shows a self-refreshing "building" page. Iterating on a game itself wants HMR — use `bun run games:<id>` for that.

## Develop

```sh
bun install                        # from repo root
bun dev                            # from repo root — http://localhost:3000, games at /games
bun run --cwd apps/web dev         # same thing, explicit
```

## Deploy — Vercel (push-to-deploy on every `main`)

Uses the **Nitro** Vite plugin (`nitro/vite`). Nitro auto-detects Vercel at build time and applies its preset — no `vercel.json`, no build target to hand-configure.

**Vercel project settings** (one-time, in the dashboard):

| Setting | Value |
| --- | --- |
| Framework Preset | **TanStack Start** |
| Root Directory | **`apps/web`** |
| Production Branch | **`main`** |
| Install / Build Command | leave auto (`bun install` / `bun run build`) |
| Output Directory | leave auto (Nitro emits the Vercel Build Output) |
| Ignored Build Step | the `ignoreCommand` in [`vercel.json`](vercel.json) |

The Ignored Build Step resolves the repository root before running `git diff`, then checks explicit repository-relative paths (`apps/web`, `apps/dev`, `packages`, `Games`, and `.claude/skills`). This works when Vercel invokes the command from the `apps/web` project root: exit 1 = build, exit 0 = skip. To reproduce locally from any directory, run `bunx vercel --cwd apps/web` and inspect the `ignoreCommand` result in the build output; a commit touching `packages/` must return exit 1, while a docs-only commit may return exit 0.

After the first import, add the **`jgengine.com`** domain to the project (Vercel → Domains). Every push to `main` then builds and goes live automatically.

CLI alternative: `bunx vercel --cwd apps/web` (preview) / `bunx vercel --prod --cwd apps/web` (production).

If a cancel-storm leaves Production on an old SHA, force a new production deploy from Actions: **Deploy Web** workflow (`workflow_dispatch`) runs `scripts/vercel-force-prod.ts` with `VERCEL_TOKEN`. Do not redeploy an old Ready row in the Vercel UI — that rebuilds the stale snapshot.

> `apps/web` must be committed and pushed to `main` before Vercel can import it. If the domain ever changes, update `SITE_URL` in [`src/lib/site.ts`](src/lib/site.ts) — it drives the social meta tags.

### Deploy signal, honestly

The **`Vercel` commit status** ("Deployment has completed" / "Deployment has failed") that shows on every PR and commit is posted by Vercel's **GitHub integration**, configured in the Vercel dashboard — not by anything in this repo. It is **not a required check** and does **not** gate merge or auto-merge; CI is the gate. So a red "Deployment has failed" on an otherwise-green PR does not block landing, and it is *not* evidence the diff is bad by itself.

When that status is red, it is one of two things — never guess, reproduce:

- **A genuine `apps/web` build break.** Reproduce it locally with `bun --cwd=apps/web run build` (the same build Vercel runs). If that fails, the diff broke the site build — fix it. This is real signal and has genuinely gone red across a run of commits when a shared import broke (e.g. a `@jgengine/core` subpath that `playground.tsx` imported).
- **Vercel-infra flakiness** (install/runner/transient) with a build that passes locally and in CI. This is environmental, independent of the diff, and safe to ignore for merge.

The **authoritative in-repo build signal** for the site is CI's **`web-build`** job (`bun run --cwd apps/web build`, runs on every push to `main`) plus the local build above — those, not the Vercel commit status, are what a green additive PR should be judged against.

The [**Vercel Deploy Logs**](../../.github/workflows/vercel-logs.yml) Actions workflow is **observability only**: it prints each main deploy's Vercel build log into its job summary. It stays green even when a deploy reports ERROR (that failure is already reported by the `Vercel` status and `web-build` — no need for a third red X); it only goes red if it cannot run at all (missing `VERCEL_TOKEN` or a Vercel API error).

**Dashboard levers (owner-only, not reachable from the repo).** If the `Vercel` PR status is ever pure noise you want quieter, that toggle lives in the Vercel dashboard: **Project → Settings → Git → "Comments" / "Commit status"** (or set `github.silent` in [`vercel.json`](vercel.json)). Leaving it on is fine — it is non-blocking and, when reproducible, real.
