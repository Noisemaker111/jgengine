# @jgengine-apps/web — jgengine.com

The landing page for JGengine and the front door for agents. It runs TanStack Start SSR on Cloudflare Workers through the official Cloudflare Vite plugin.

- Humans get live engine examples on `/`, `/playground`, `/capabilities`, `/why`, and `/editor`.
- Agents get `/llms.txt` and `/llms-full.txt` from the same site constants as the human pages.
- The games catalog and static runner live on `/games` and `/play`.

## Games on the site

`bun --cwd=apps/web run build` builds the SDK packages before Vite builds the site and the `games-player` plugin builds `apps/dev` into `public/play`.
CI runs this command on cold checkouts for pushes and PRs; deploy uses the same build.
The ignored `Games` checkout must be a real `Noisemaker111/JGengine-games` clone with its dependencies installed:

```sh
bun run games:clone
bun --cwd=Games install
```

The dev server serves the same runner build and restores it from the content-hash cache when game and engine sources have not changed.

## Design system

- Colors, type and surfaces are CSS tokens at the top of [`src/styles.css`](src/styles.css), exposed to Tailwind as `bg`, `raised`, `sunken`, `line`, `fg`, `muted`, `faint`, `accent`, `accent-text` and `live`. Use those names, not raw palette classes, so both themes work.
- The theme follows the system until the visitor toggles it; `?theme=light|dark` forces one for a page view (captures, shared links). Sections that sit on a live 3D canvas pin `data-theme="dark"`.
- Game titles and descriptions come from the `Games/README.md` table; covers are `public/covers/<id>.webp` (800×450, from `bun run shoot <id> --mode play`).
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
bun run deploy:cloudflare
```

The build emits the TanStack Start Worker and static assets under `dist/`. Wrangler follows the generated deployment configuration automatically.

Before changing `jgengine.com`, verify `/`, `/capabilities`, `/games`, and `/play` on the `workers.dev` preview.
