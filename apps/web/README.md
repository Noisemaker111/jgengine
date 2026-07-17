# @jgengine-apps/web — jgengine.com

The landing page for JGengine and the front door for agents. TanStack Start (SSR) on **Vercel** via Nitro.

- **Humans** get a marketing-plus-docs site: the landing (`/`), **Why JGengine** (`/why` — the honest pitch, pros/cons, a hand-rolled-vs-authored diff), **Capabilities** (`/capabilities` — every system shown as the real code you write), and **Editor** (`/editor` — the standalone 3D scene editor).
- **Humans** have one interface: `Make a game that … with jgengine` (to any coding agent). The site shows that prompt; the CLI is for agents underneath. Each page markets *and* documents — code snippets are real API, not decoration.

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
