# @jgengine-apps/web — jgengine.com

The landing page for JGengine and the front door for agents. It runs TanStack Start SSR on Cloudflare Workers through the official Cloudflare Vite plugin.

- Humans get live engine examples on `/`, `/playground`, `/capabilities`, `/why`, and `/editor`.
- Agents get `/llms.txt` and `/llms-full.txt` from the same site constants as the human pages.
- The games catalog and static runner live on `/games` and `/play`.

## Games on the site

`vite build` runs the existing `games-player` plugin, which builds `apps/dev` into `public/play`. The ignored `Games` checkout must be a real `Noisemaker111/JGengine-games` clone with its dependencies installed:

```sh
bun run games:clone
bun --cwd=Games install
```

The dev server serves the same runner build and restores it from the content-hash cache when game and engine sources have not changed.

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

Before changing `jgengine.com`, verify `/`, `/capabilities`, `/games`, and `/play` on the `workers.dev` preview. The domain remains on Vercel until that cutover is approved.
