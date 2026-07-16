# @jgengine/assets

A self-generating, license-verified index of thousands of CC0 3D models, PBR materials, **and 2D sprite/icon packs** G�� hosted at **zero cost**. No GLB, texture, or sprite bytes ship in the npm tarball; every byte comes from infrastructure you don't pay for:

| What | Where it lives | Whose bandwidth |
|------|----------------|-----------------|
| Pack GLBs (Quaternius, KayKitGǪ) | Fetched at `pull` time from the provider's CDN | Provider's |
| PBR materials (ambientCG) | Fetched at `pull` time (provider or the `packs` release mirror) | Provider's / GitHub's |
| Sprite/icon packs (game-icons.net) | Fetched at `pull` time (provider or the `packs` release mirror) | Provider's / GitHub's |
| The generated index (JSON) | Inside this npm package | npm (KB) |
| Your one-off models | `packages/assets/local/`, served via jsDelivr-over-GitHub | GitHub + jsDelivr |
| A consumer's downloaded bytes | Their `public/models/` + `public/materials/` + `public/sprites/` (gitignored) | The consumer's |

## Layers

1. **Sources** (`src/sources/*.ts`) G�� one entry per downloadable pack. Every entry carries required `license` + `author` and a `download` that is either a pinned `{ url, sha256? }` or a `{ scrape }` marker.
2. **Generated index** (`src/generated/*.json`) G�� machine-produced from the real `.glb` filenames after a pack is extracted. Never hand-typed. Committed JSON; bytes are not.
3. **Aliases** (`src/aliases.ts`) G�� hand-authored semantic keys (`nature/tree_pine G�� quaternius-stylized-nature/Pine_1`).
4. **Singles** (`src/singles.json`) G�� long-tail one-offs (per-model `url` + `license`).
5. **Materials** (`src/sources/ambientcg.ts` + `src/materials.ts`) G�� `kind: "material"` sources, one CC0 PBR material each (hundreds of ambientCG materials: grass, rock, wood, brick, metal, fabricGǪ). `pull` normalizes the maps to fixed filenames, so `buildMaterialCatalog({ basePath })` resolves ids and `material/GǪ` aliases to map URLs with no generated index at all.
6. **Sprites** (`src/sources/gameicons.ts` + `src/spriteIndexGen.ts`) G�� `kind: "sprite"` sources, packs of individual SVG/PNG icon and UI files (game-icons.net's ~4,000 CC BY 3.0 icons as one mirrored repo). Same shape as models G�� `reindex-sprites` discovers real files after a pull and writes `src/generated-sprites/*.json`, resolved through `buildSpriteCatalog({ basePath })`.

Model entries collapse into the core `AssetCatalog` via `buildCatalog({ basePath })`; materials resolve through `buildMaterialCatalog({ basePath })`; sprites/icons resolve through `buildSpriteCatalog({ basePath })`.

## `add` G�� one command for anything

`assets add <query>` is the front door. It fuzzy-searches **every** catalog at once G�� 3D models, whole packs, PBR materials, sprite/icon packs, HUD components (the shadcn registry), and `game-icon` glyphs G�� then does the fetch and prints the exact copy-paste wiring. One mental model instead of six.

```bash
assets add astronaut --dir ../../apps/dev/public   # model G�� pull + reindex + print the assets.ts snippet
assets add nature    --dir ../../apps/dev/public   # whole pack G�� pull + reindex + how to wire an id
assets add grass --kind material --dir ../../apps/dev/public  # PBR material G�� pull maps + resolve snippet
assets add "game icons" --dir ../../apps/dev/public  # sprite pack G�� pull + reindex-sprites + resolve snippet
assets add "mana bar"                              # HUD component G�� the `npx shadcn add` cmd + <VitalBar/> usage
assets add sword                                    # icon G�� the game-icon name to drop in a slot
```

- A **model / pack** match is fully automated: if the pack isn't already in `<dir>/models/`, it's pulled and extracted, then `reindex` runs so the id is addressable, then the `buildCatalog` + model-seam snippet is printed.
- A **material** match pulls the maps into `<dir>/materials/<id>/` with normalized names (`color.jpg`, `normal.jpg`, `roughness.jpg`, `ao.jpg`, `displacement.jpg`) and prints the `buildMaterialCatalog` resolve snippet G�� no reindex needed, the material catalog is fully static.
- A **sprite / spritePack** match works like model/pack: if the pack isn't already in `<dir>/sprites/`, it's pulled and extracted, then `reindex-sprites` runs so individual SVG/PNG ids are addressable, then the `buildSpriteCatalog` snippet is printed.
- A **component / icon** match prints the one-liner to run and the import + usage G�� no bytes to pull.
- Ambiguous query? `add` lists the top matches across kinds; narrow with `--kind model|pack|material|component|icon|sprite|spritePack` or a more specific term. `--json` emits the ranked matches for scripting.

The same ranking is available programmatically: `import { findAssets } from "@jgengine/assets"`.

## CLI

```
assets add <query> [--kind <k>] [--dir <dir>] [--mirror <baseUrl>] [--json]
                                               # unified import: models, packs, materials, sprites, components, icons
assets list [--category <c>] [--source <s>] [--kind material|sprite|spritePack]
                                               # browse the generated model/sprite index, or the material/sprite-pack catalog
assets search <term>                          # grep the model index
assets pull <source-id> [--dir public] [--mirror <baseUrl>] [--offline]
                                               # download + extract a pack into <dir>/models|materials|sprites/<source>/
assets register <path|url> --category <c> --license <l> [--author <a>]
                                               # register a one-off single into the shipped index
assets reindex [public/models]                # regenerate generated/*.json from pulled model packs
assets reindex-sprites [public/sprites]       # regenerate generated-sprites/*.json from pulled sprite packs
assets verify                                 # license + alias-integrity gate
```

Run in-repo with `bun run --cwd packages/assets src/cli/pull.ts <verb> GǪ`. (`add <path|url> --license GǪ` still works as an alias for `register`.)

### Mirror fallback and offline pulls

`pull` never has just one path to the bytes. For a given `source-id` it tries, in order, until one succeeds:

1. **Mirror base override** G�� `--mirror <baseUrl>` (or the `JGENGINE_ASSETS_MIRROR` env var if `--mirror` is not passed) G�� the archive is expected at `<baseUrl>/<provider>/<source-id>.zip`, e.g. `https://my-mirror.example.com/quaternius/quaternius-stylized-nature.zip`.
2. **The default GitHub-release mirror** G�� `https://github.com/Noisemaker111/jgengine/releases/download/packs/<provider>-<source-id>.zip`, on this repo's own rolling `packs` release (no separate assets repo). github.com is reachable from every cloud sandbox with no network-policy change, so zero-setup sessions still pull. `.github/workflows/mirror-assets.yml` (weekly cron + manual dispatch) keeps the release in sync with `src/sources/*.ts` automatically G�� adding a catalog entry is the whole publishing step, no manual upload. Skip this hop with `JGENGINE_ASSETS_NO_DEFAULT_MIRROR=1`. Model/sprite pack failures fail the job; individual ambientCG material 404s are soft (logged, non-fatal).
3. **The primary provider path** G�� pinned `{ url, sha256? }` when stable: **KayKit** G�� `github.com/KayKit-Game-Assets/*/archive/GǪ/main.zip`; **Quaternius** free Standard packs G�� OpenGameArt direct zips (site pages JS-gate). Else scrape. `extractGlbs` packs co-located `.gltf`+`.bin` into `.glb`.
4. **The pack's own `mirror`** G�� an optional direct archive URL set on the `AssetSource` entry itself (`src/sources/*.ts`), tried as a last resort.

If every attempt fails, `pull` throws one aggregated error naming every URL it tried and why each one failed. Whenever the source's `download` is pinned with a `sha256`, the downloaded bytes are hashed and checked against it **no matter which path supplied them** G�� a mirror serving stale or tampered bytes is rejected and the next source in the chain is tried instead.

`--offline` skips the network entirely: it succeeds immediately if `<dir>/models/<source-id>/` already has files in it, and otherwise fails fast with a message telling you to pull once on a connected machine or point `--mirror`/`JGENGINE_ASSETS_MIRROR` at a reachable archive G�� useful for CI scripts that should error in seconds instead of hanging on a blocked fetch.

**Network-restricted environments** G�� a `403` on `CONNECT` from an outbound proxy means the environment's network policy blocks that provider host (common in sandboxed cloud sessions); it is a policy decision, not a transient failure, so retrying never helps. Either allowlist the host in the environment settings, or pull once on a machine that can reach the providers, then:

- commit (or otherwise host) the resulting `public/models/<source-id>/` directory so restricted environments read it straight off disk and use `assets pull --offline` as a fast, honest no-op check, or
- host your own mirror of the zip archives at `<baseUrl>/<provider>/<source-id>.zip` and set `JGENGINE_ASSETS_MIRROR=<baseUrl>` (or pass `--mirror <baseUrl>`) so `pull` fetches from it instead of the original provider.

## Adding assets

**A whole new pack** G�� add one entry to the matching `src/sources/*.ts` (this is the layer contributors PR). No filenames are hand-typed; `reindex` reads the real `.glb` names out of the extracted pack, so entries can't silently 404.

```ts
// src/sources/quaternius.ts G�� QUATERNIUS_PACKS
{ id: "quaternius-fantasy-props", slug: "fantasypropsmegakit", title: "Fantasy Props MegaKit", categories: ["fantasy", "prop"] },
```

```bash
bun src/cli/pull.ts pull quaternius-fantasy-props --dir ../../apps/dev/public   # fetch + extract GLBs
bun src/cli/pull.ts reindex ../../apps/dev/public/models                        # regenerate generated/*.json + barrel
bun src/cli/pull.ts verify                                                      # license + alias gate
```

A **new provider** is just a new `src/sources/<provider>.ts` added to the `sources` array in `src/sources/index.ts`. Pinned providers use `download: { url, sha256? }`; providers whose pages JS-gate the download and can't be pinned use `download: { scrape: <page> }`. Any entry can also carry an optional top-level `mirror: <archiveUrl>` G�� a direct URL `pull` falls back to if both a `--mirror`/`JGENGINE_ASSETS_MIRROR` override and the primary path fail (see "Mirror fallback and offline pulls" above). Kenney.nl is not an eligible provider for this repo G�� see CLAUDE.md "Never Kenney".

**A whole new sprite/icon pack** G�� same shape as a model pack, just `kind: "sprite"` and `reindex-sprites` instead of `reindex`; files are matched by `.svg`/`.png` extension, deduped by basename regardless of archive nesting, so no filenames are hand-typed here either. `src/sources/gameicons.ts` is the current example (`gameicons-icons`); a new sprite provider follows the same shape in its own `src/sources/<provider>.ts`.

```bash
bun src/cli/pull.ts pull gameicons-icons --dir ../../apps/dev/public        # fetch + extract SVG/PNG
bun src/cli/pull.ts reindex-sprites ../../apps/dev/public/sprites           # regenerate generated-sprites/*.json + barrel
```

**A single one-off** G�� no code edit, zero bytes stored (URL) or copied into `local/` (path):

```bash
assets add "https://poly.pizza/GǪ/model.glb" --category prop --license CC0-1.0 --author "Some Author"
```

## Importing in code

Build the catalog once, then address ids (or aliases) G�� resolve returns `{ url }`:

```ts
import { buildCatalog } from "@jgengine/assets";

const catalog = buildCatalog({ basePath: "/models" });

catalog.resolve("quaternius-stylized-nature/Pine_1"); // { url: "/models/quaternius-stylized-nature/Pine_1.glb" }
catalog.resolve("nature/tree_pine");                   // alias G�� same url

// wire ids straight into a game's model seams:
export const game: PlayableGame = {
  // GǪ
  objectModels: {
    "quaternius-stylized-nature/Pine_1": { url: catalog.resolve("quaternius-stylized-nature/Pine_1")!.url, scale: 1.4 },
  },
  entityModels: {
    hero: { url: catalog.resolve("kaykit-adventurers/Barbarian")!.url, scale: 1.1 },
  },
};
```

`buildCatalog({ sources: ["quaternius-stylized-nature"] })` restricts to chosen packs; `includeAliases` / `includeSingles` default true. Discover ids with `assets add <query>` (or `assets search <term>` / `assets list --category <c>`) instead of memorizing them.

Materials resolve the same way G�� ids (or `material/GǪ` aliases) to normalized PBR map URLs:

```ts
import { buildMaterialCatalog } from "@jgengine/assets";

const materials = buildMaterialCatalog({ basePath: "/materials" });

materials.resolve("ambientcg-grass001")!.maps.color; // "/materials/ambientcg-grass001/color.jpg"
materials.resolve("material/grass")!.maps.normal;    // alias G�� "/materials/ambientcg-grass001/normal.jpg"
```

Sprite/icon packs resolve the same way once pulled + reindexed G�� individual files, not whole packs:

```ts
import { buildSpriteCatalog } from "@jgengine/assets";

const sprites = buildSpriteCatalog({ basePath: "/sprites" });

sprites.resolve("gameicons-icons/sword")!.url; // "/sprites/gameicons-icons/sword.svg"
```

### Serving the bytes

A resolved id only yields a **URL** G�� the GLB must be somewhere your app serves. For a game, `pull` the packs into your app's `public/`, and line `basePath` up with it:

```bash
bun src/cli/pull.ts pull quaternius-stylized-nature --dir ../../apps/dev/public   # G�� apps/dev/public/models/quaternius-stylized-nature/*.glb
```

`buildCatalog({ basePath: "/models" })` then resolves to `/models/quaternius-stylized-nature/GǪ`, which the dev server serves from `public/models/` (gitignored G�� the bytes are the consumer's, fetched once from the provider's CDN).

Sprite/icon packs pull the same way, into `public/sprites/`:

```bash
bun src/cli/pull.ts pull gameicons-icons --dir ../../apps/dev/public        # G�� apps/dev/public/sprites/gameicons-icons/*.svg
bun src/cli/pull.ts reindex-sprites ../../apps/dev/public/sprites           # G�� src/generated-sprites/gameicons-icons.json
```

## Notes

- Quaternius / KayKit pages gate downloads behind JS; sources without a pinned OpenGameArt/GitHub zip `scrape` the pack page as a fallback, and automated `pull` falls back to a clear error when no archive link is found G�� download those manually into the staging dir, then `reindex`.
- `pull`'s mirror fallback and `--offline` guard exist for network-restricted environments (CI, sandboxes without provider access); see "Mirror fallback and offline pulls" above.
- `gameicons-icons` is **CC BY 3.0**, not CC0 G�� a game using it needs one credit line (source, "game-icons.net contributors", license) per the engine's asset-credit rule; the repo's own per-author `license.txt` files carry the individual credits behind this pack's single collective `author` field.
- `src/generated-sprites/` starts empty for a brand-new sprite source G�� same as any brand-new model pack, the committed per-file index only exists after someone runs `pull` + `reindex-sprites` with real network access; until then the source is fully declared (and the weekly mirror job will fetch it) but has no individually-addressable ids yet.
