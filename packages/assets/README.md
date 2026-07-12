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

## `add` — one command for anything

`assets add <query>` is the front door. It fuzzy-searches **every** catalog at once — 3D models, whole packs, HUD components (the shadcn registry), and `game-icon` glyphs — then does the fetch and prints the exact copy-paste wiring. One mental model instead of four.

```bash
assets add astronaut --dir ../../apps/dev/public   # model → pull + reindex + print the assets.ts snippet
assets add nature    --dir ../../apps/dev/public   # whole pack → pull + reindex + how to wire an id
assets add "mana bar"                              # HUD component → the `npx shadcn add` cmd + <VitalBar/> usage
assets add sword                                    # icon → the game-icon name to drop in a slot
```

- A **model / pack** match is fully automated: if the pack isn't already in `<dir>/models/`, it's pulled and extracted, then `reindex` runs so the id is addressable, then the `buildCatalog` + model-seam snippet is printed.
- A **component / icon** match prints the one-liner to run and the import + usage — no bytes to pull.
- Ambiguous query? `add` lists the top matches across kinds; narrow with `--kind model|pack|component|icon` or a more specific term. `--json` emits the ranked matches for scripting.

The same ranking is available programmatically: `import { findAssets } from "@jgengine/assets"`.

## CLI

```
assets add <query> [--kind <k>] [--dir <dir>] [--mirror <baseUrl>] [--json]
                                               # unified import: models, packs, components, icons
assets list [--category <c>] [--source <s>]   # browse the generated index
assets search <term>                          # grep the index
assets pull <source-id> [--dir public] [--mirror <baseUrl>] [--offline]
                                               # download + extract a whole pack's GLBs into <dir>/models/<source>/
assets register <path|url> --category <c> --license <l> [--author <a>]
                                               # register a one-off single into the shipped index
assets reindex [public/models]                # regenerate generated/*.json from pulled packs
assets verify                                 # license + alias-integrity gate
```

Run in-repo with `bun run --cwd packages/assets src/cli/pull.ts <verb> …`. (`add <path|url> --license …` still works as an alias for `register`.)

### Mirror fallback and offline pulls

`pull` never has just one path to the bytes. For a given `source-id` it tries, in order, until one succeeds:

1. **Mirror base override** — `--mirror <baseUrl>` (or the `JGENGINE_ASSETS_MIRROR` env var if `--mirror` is not passed) — the archive is expected at `<baseUrl>/<provider>/<source-id>.zip`, e.g. `https://my-mirror.example.com/kenney/kenney-nature.zip`.
2. **The default GitHub-release mirror** — `https://github.com/Noisemaker111/jgengine-assets/releases/download/packs/<provider>-<source-id>.zip`, on the rolling `packs` release of `Noisemaker111/jgengine-assets`. github.com is reachable from every cloud sandbox with no network-policy change, so zero-setup sessions still pull. Publishing a pack is just uploading a correctly named zip to that release — no code change. Skip this hop with `JGENGINE_ASSETS_NO_DEFAULT_MIRROR=1`.
3. **The primary provider path** — the source's pinned `{ url, sha256? }` or, for providers that rotate URLs (Kenney), a scrape of the asset page.
4. **The pack's own `mirror`** — an optional direct archive URL set on the `AssetSource` entry itself (`src/sources/*.ts`), tried as a last resort.

If every attempt fails, `pull` throws one aggregated error naming every URL it tried and why each one failed. Whenever the source's `download` is pinned with a `sha256`, the downloaded bytes are hashed and checked against it **no matter which path supplied them** — a mirror serving stale or tampered bytes is rejected and the next source in the chain is tried instead.

`--offline` skips the network entirely: it succeeds immediately if `<dir>/models/<source-id>/` already has files in it, and otherwise fails fast with a message telling you to pull once on a connected machine or point `--mirror`/`JGENGINE_ASSETS_MIRROR` at a reachable archive — useful for CI scripts that should error in seconds instead of hanging on a blocked fetch.

**Network-restricted environments** — a `403` on `CONNECT` from an outbound proxy means the environment's network policy blocks that provider host (common in sandboxed cloud sessions); it is a policy decision, not a transient failure, so retrying never helps. Either allowlist the host in the environment settings, or pull once on a machine that can reach the providers, then:

- commit (or otherwise host) the resulting `public/models/<source-id>/` directory so restricted environments read it straight off disk and use `assets pull --offline` as a fast, honest no-op check, or
- host your own mirror of the zip archives at `<baseUrl>/<provider>/<source-id>.zip` and set `JGENGINE_ASSETS_MIRROR=<baseUrl>` (or pass `--mirror <baseUrl>`) so `pull` fetches from it instead of the original provider.

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

A **new provider** is just a new `src/sources/<provider>.ts` added to the `sources` array in `src/sources/index.ts`. Pinned providers use `download: { url, sha256? }`; providers that rotate URLs (Kenney) use `download: { scrape: <page> }`. Any entry can also carry an optional top-level `mirror: <archiveUrl>` — a direct URL `pull` falls back to if both a `--mirror`/`JGENGINE_ASSETS_MIRROR` override and the primary path fail (see "Mirror fallback and offline pulls" above).

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

`buildCatalog({ sources: ["kenney-nature"] })` restricts to chosen packs; `includeAliases` / `includeSingles` default true. Discover ids with `assets add <query>` (or `assets search <term>` / `assets list --category <c>`) instead of memorizing them.

### Serving the bytes

A resolved id only yields a **URL** — the GLB must be somewhere your app serves. For a game, `pull` the packs into your app's `public/`, and line `basePath` up with it:

```bash
bun src/cli/pull.ts pull kenney-nature --dir ../../apps/dev/public   # → apps/dev/public/models/kenney-nature/*.glb
```

`buildCatalog({ basePath: "/models" })` then resolves to `/models/kenney-nature/…`, which the dev server serves from `public/models/` (gitignored — the bytes are the consumer's, fetched once from the provider's CDN).

## Notes

- Kenney rotates download URLs, so its sources `scrape` the asset page at pull time.
- Quaternius / KayKit pages gate downloads behind JS; automated `pull` falls back to a clear error when no archive link is found — download those manually into the staging dir, then `reindex`.
- `pull`'s mirror fallback and `--offline` guard exist for network-restricted environments (CI, sandboxes without provider access); see "Mirror fallback and offline pulls" above.
