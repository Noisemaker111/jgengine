# @jgengine-apps/web — jgengine.com

The landing page for JGengine and the front door for agents. TanStack Start (SSR) on **Vercel** via Nitro.

- **Humans** get a rendered landing page (`/`), a skills index (`/skills`), and rendered skill pages (`/skills/<name>`) to explore what each skill does.
- **Humans** have one interface: `Make a game that … with jgengine` (to any coding agent). The site shows that prompt; the CLI is for agents underneath. The intake skill routes into focused API domains; the site renders skill sources rather than maintaining separate copies.

## The site is generated from the engine — deploying the engine updates the site

The skill pages are rendered straight from the repo's `.claude/skills/jgengine-*/SKILL.md` (bundled at build via Vite `?raw` in [`src/content/skills.ts`](src/content/skills.ts)). The per-skill "grab this when…" guidance lives in [`src/lib/site.ts`](src/lib/site.ts). Nothing on this site is a hand-copied duplicate of a skill.

Because of that, **any push to `main` that touches `.claude/skills/` or `packages/` rebuilds and redeploys the site with the current engine** (the paths are listed in [`vercel.json`](vercel.json)'s `ignoreCommand`). Editing a skill or shipping an engine change *is* a website update — there is no separate content step.

### Games are built from `apps/dev`, not authored here

`vite build` also builds the game player: the `games-player` plugin in [`vite.config.ts`](vite.config.ts) shells out to `apps/dev`'s `build:site` script, which runs the same Vite app used for local game dev with `--base /play/` into `public/play`. Players visit `/games/<id>` ([`src/routes/games.$gameId.tsx`](src/routes/games.$gameId.tsx)), which embeds the runner from its internal `/play` mount. In dev, the `games-player-dev` plugin spawns `apps/dev`'s `dev:site` server and nitro's `devProxy` forwards `/play` to it, so `/games/<id>` is playable from the local site too. The header's Games dropdown ([`src/components/Layout.tsx`](src/components/Layout.tsx)) is generated at build time from [`src/content/games.ts`](src/content/games.ts), which globs `Games/*/package.json` — add a game under `Games/` and it appears in the dropdown and at `/games/<id>` with no other wiring.

## Develop

```sh
bun install                        # from repo root
bun dev                            # from repo root — http://localhost:3000, games at /play
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
| Ignored Build Step | `git diff --quiet HEAD^ HEAD -- . ../../skills ../../packages ../../Games ../dev` |

The Ignored Build Step (run from `apps/web`) forces a rebuild whenever this app, the skills, an engine package, or a game changed — so an engine release or a new game on `main` redeploys the site. Exit 1 = build, exit 0 = skip.

After the first import, add the **`jgengine.com`** domain to the project (Vercel → Domains). Every push to `main` then builds and goes live automatically.

CLI alternative: `bunx vercel --cwd apps/web` (preview) / `bunx vercel --prod --cwd apps/web` (production).

> `apps/web` must be committed and pushed to `main` before Vercel can import it. If the domain ever changes, update `SITE_URL` in [`src/lib/site.ts`](src/lib/site.ts) — it drives the social meta tags.
