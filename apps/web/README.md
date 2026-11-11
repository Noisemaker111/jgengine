# @jgengine-apps/web — jgengine.com

The landing page for JGengine and the front door for agents. It is drawn with the engine's own JSX runtime (`@jgengine/core/ui/jsx`), not React, and served from Cloudflare through the official Cloudflare Vite plugin.

- `/` presents real game captures, engine systems, and an editable starting prompt. `/games` opens the playable projects; `/capabilities` indexes the SDK; `/editor` runs the scene editor.
- Agents get `/llms.txt` and `/llms-full.txt` from the same site constants as the human pages.
- The games catalog and static runner live on `/games` and `/play`.

## How a page is made

- [`src/site/routes.ts`](src/site/routes.ts) is the page table: each path, the module in `src/routes/` that draws it, and that module's `Route = definePage({ head, component })`. Links are `Link` from [`src/site/link.tsx`](src/site/link.tsx), plain `<a>` tags; every visit is a full page load.
- [`src/site/render.tsx`](src/site/render.tsx) renders a page to a whole HTML document with the engine's static renderer. The dev server calls it per request; `bun run build` calls it for every page after `vite build` ([`scripts/prerender.ts`](scripts/prerender.ts)) and writes `dist/client/<page>.html` plus `404.html`.
- [`src/client.tsx`](src/client.tsx) runs in the browser and draws the same page into `<body>`, which starts its buttons, menus and live demos.
- [`src/worker.ts`](src/worker.ts) is the Worker. Static files are served before it runs; it answers `/api/*`, `/llms.txt`, `/llms-full.txt`, `/agents.md`, `/sitemap.xml`, and any other path with `404.html` and status 404.

## Games on the site

`bun --cwd=apps/web run build` builds the SDK packages before Vite builds the site and the `games-player` plugin builds `apps/dev` into `public/play`.
Each game's own `public/` files (its provisioned models, textures and sounds) are written to `public/play/games/<id>/`, and the runner loads a game's paths from there, so two games can ship different files at the same path.
CI runs this command on cold checkouts for pushes and PRs; deploy uses the same build.
The site lists every game under `games/` in this repo; a root `bun install` is all it needs.

The dev server serves the same runner build and restores it from the content-hash cache when game and engine sources have not changed.

## Design system

- Colors, type and surfaces are CSS tokens at the top of [`src/styles.css`](src/styles.css), exposed to Tailwind as `bg`, `raised`, `sunken`, `line`, `fg`, `muted`, `faint`, `accent`, `accent-text` and `live`. Use those names, not raw palette classes, so both themes work.
- [`src/home.css`](src/home.css) owns the graphite/lime editorial layout. The homepage hero uses actual game covers and links to those games; the procedural playground is a separate technical tool, not homepage proof of game quality.
- The theme follows the system until the visitor toggles it; `?theme=light|dark` forces one for a page view (captures, shared links). Sections that sit on a live 3D canvas pin `data-theme="dark"`.
- Game titles and descriptions come from the `games/README.md` table; covers are `public/covers/<id>.webp` (800×450, from `bun run shoot <id> --mode play`).
- The landing's "big games from small blocks" rows are keys into the skills' generated `capabilities.md`; `src/lib/capabilityIndex.test.ts` fails if one disappears.
- Pages flag `data-jg-capture="ready"` after fonts load; live canvases mark it `pending` until they draw, so `bun run shoot --site <route>` works on every page.

## Develop

```sh
bun run agent:bootstrap
bun dev
```

## Deploy to Cloudflare

The Worker configuration is [`wrangler.jsonc`](wrangler.jsonc). Build and deploy from the repository root:

```sh
bun --cwd=apps/web run deploy:cloudflare
```

The build emits the prerendered pages and static files under `dist/client` and the Worker under `dist/server`. Wrangler follows the generated deployment configuration automatically.

Between the build and the upload, `scripts/check-site-assets.ts` checks every file and pack each game names is in the built runner; one missing file stops the deploy (and so the release).

The same check is written into the built `dist/server/wrangler.json` as wrangler's `build.command`, so even a bare `wrangler deploy` in `apps/web` runs it and refuses to upload a build with missing models, LUTs or HDRIs; the refusal says to use `bun run deploy:site`.

Before changing `jgengine.com`, verify `/`, `/capabilities`, `/games`, and `/play` on the `workers.dev` preview.
