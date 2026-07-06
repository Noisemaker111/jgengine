# @jgengine-apps/web — jgengine.com

The landing page for JGengine and the front door for agents. TanStack Start (SSR) on **Vercel** via Nitro.

- **Humans** get a rendered landing page (`/`), a skills index (`/skills`), and rendered skill pages (`/skills/<name>`) to explore what each skill does.
- **Agents** are handed one instruction — `npx skills add Noisemaker111/jgengine` — plus a "which skill for what" guide. The site references the skills; it does not dump their contents or serve an `llms.txt`.

## The site is generated from the engine — deploying the engine updates the site

The skill pages are rendered straight from the repo's `skills/*/SKILL.md` (bundled at build via Vite `?raw` in [`src/content/skills.ts`](src/content/skills.ts)). The per-skill "grab this when…" guidance lives in [`src/lib/site.ts`](src/lib/site.ts). Nothing on this site is a hand-copied duplicate of a skill.

Because of that, **any push to `main` that touches `skills/` or `packages/` rebuilds and redeploys the site with the current engine.** Editing a skill or shipping an engine change *is* a website update — there is no separate content step.

## Develop

```sh
bun install                        # from repo root
bun run --cwd apps/web dev         # http://localhost:3000
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
| Ignored Build Step | `git diff --quiet HEAD^ HEAD -- . ../../skills ../../packages` |

The Ignored Build Step (run from `apps/web`) forces a rebuild whenever this app, the skills, or any engine package changed — so an engine release on `main` redeploys the site. Exit 1 = build, exit 0 = skip.

After the first import, add the **`jgengine.com`** domain to the project (Vercel → Domains). Every push to `main` then builds and goes live automatically.

CLI alternative: `bunx vercel --cwd apps/web` (preview) / `bunx vercel --prod --cwd apps/web` (production).

> `apps/web` must be committed and pushed to `main` before Vercel can import it. If the domain ever changes, update `SITE_URL` in [`src/lib/site.ts`](src/lib/site.ts) — it drives the social meta tags.
