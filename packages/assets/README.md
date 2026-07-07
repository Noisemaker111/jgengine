# @jgengine/assets

A self-generating, license-verified index of thousands of CC0 3D models — hosted at **zero cost**. No GLB bytes ship in the npm tarball; every byte comes from infrastructure you don't pay for:

| What | Where it lives | Whose bandwidth |
|------|----------------|-----------------|
| Pack GLBs (Kenney, Quaternius, KayKit…) | Fetched at `pull` time from the provider's CDN | Provider's |
| The generated index (JSON) | Inside this npm package | npm (KB) |
| Your one-off models | `packages/assets/local/`, served via jsDelivr-over-GitHub | GitHub + jsDelivr |
| A consumer's downloaded bytes | Their `public/models/` (gitignored) | The consumer's |

## Layers

1. **Sources** (`src/sources/*.ts`) — one entry per downloadable pack. Every entry carries required `license` + `author` and a `download` that is either a pinned `{ url, sha256? }` or a `{ scrape }` marker.
2. **Generated index** (`src/generated/*.json`) — machine-produced from the real `.glb` filenames after a pack is extracted. Never hand-typed. Committed JSON; bytes are not.
3. **Aliases** (`src/aliases.ts`) — hand-authored semantic keys (`nature/tree_pine → kenney-nature/tree_pineDefaultA`).
4. **Singles** (`src/singles.json`) — long-tail one-offs (per-model `url` + `license`).

Everything collapses into the core `AssetCatalog` via `buildCatalog({ basePath })`.

## CLI

```
assets list [--category <c>] [--source <s>]   # browse the generated index
assets search <term>                          # grep the index
assets pull <source-id> [--dir public]        # download + extract GLBs into <dir>/models/<source>/
assets add <path|url> --category <c> --license <l> [--author <a>]
assets reindex [public/models]                # regenerate generated/*.json from pulled packs
assets verify                                 # license + alias-integrity gate
```

Run in-repo with `bun run --cwd packages/assets src/cli/pull.ts <verb> …`.

## Adding assets

**A whole new pack** — add one entry to the matching `src/sources/*.ts` (this is the layer contributors PR). No filenames are hand-typed; `reindex` reads the real `.glb` names out of the extracted pack, so entries can't silently 404.

```ts
// src/sources/kenney.ts → KENNEY_PACKS
{ id: "kenney-food", slug: "food-kit", title: "Food Kit", categories: ["food", "prop"] },
```

```bash
bun src/cli/pull.ts pull kenney-food --dir ../../apps/dev/public   # fetch + extract GLBs
bun src/cli/pull.ts reindex ../../apps/dev/public/models           # regenerate generated/*.json + barrel
bun src/cli/pull.ts verify                                         # license + alias gate
```

A **new provider** is just a new `src/sources/<provider>.ts` added to the `sources` array in `src/sources/index.ts`. Pinned providers use `download: { url, sha256? }`; providers that rotate URLs (Kenney) use `download: { scrape: <page> }`.

**A single one-off** — no code edit, zero bytes stored (URL) or copied into `local/` (path):

```bash
assets add "https://poly.pizza/…/model.glb" --category prop --license CC0-1.0 --author "Some Author"
```

## Importing in code

Build the catalog once, then address ids (or aliases) — resolve returns `{ url }`:

```ts
import { buildCatalog } from "@jgengine/assets";

const catalog = buildCatalog({ basePath: "/models" });

catalog.resolve("kenney-nature/tree_pineDefaultA"); // { url: "/models/kenney-nature/tree_pineDefaultA.glb" }
catalog.resolve("nature/tree_pine");                // alias → same url

// wire ids straight into a game's model seams:
export const game: PlayableGame = {
  // …
  objectModels: {
    "kenney-nature/tree_pineDefaultA": { url: catalog.resolve("kenney-nature/tree_pineDefaultA")!.url, scale: 1.4 },
  },
  entityModels: {
    hero: { url: catalog.resolve("kenney-space/astronautA")!.url, scale: 1.1 },
  },
};
```

`buildCatalog({ sources: ["kenney-nature"] })` restricts to chosen packs; `includeAliases` / `includeSingles` default true. Discover ids with `assets search <term>` / `assets list --category <c>` instead of memorizing them. See `Games/asset-showcase` for a full working example.

### Serving the bytes

A resolved id only yields a **URL** — the GLB must be somewhere your app serves. For a game, `pull` the packs into your app's `public/`, and line `basePath` up with it:

```bash
bun src/cli/pull.ts pull kenney-nature --dir ../../apps/dev/public   # → apps/dev/public/models/kenney-nature/*.glb
```

`buildCatalog({ basePath: "/models" })` then resolves to `/models/kenney-nature/…`, which the dev server serves from `public/models/` (gitignored — the bytes are the consumer's, fetched once from the provider's CDN).

## Notes

- Kenney rotates download URLs, so its sources `scrape` the asset page at pull time.
- Quaternius / KayKit pages gate downloads behind JS; automated `pull` falls back to a clear error when no archive link is found — download those manually into the staging dir, then `reindex`.
