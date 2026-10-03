# Game-owned asset imports

Use `validateImportSpec` and `classifyAssetFile` from `@jgengine/assets/importSpec` before ingesting a game's own media. This pure seam describes and checks imports; it does not copy files or register a catalog entry.

The spec owns the logical kind (`model`, `texture`, `material`, `sprite`, `spriteSheet`, `audio`, `font`, `hdri`), stable id, relative POSIX file paths, custom file roles and plain JSON metadata. Paths stay exactly as authored. Absolute paths, traversal segments, duplicate files, malformed roles and non-JSON metadata fail with a reason. Successful validation returns an independent JSON snapshot.

Classify complete file bytes before choosing a loader. Filename extensions never override the bytes. The classifier recognizes GLB/glTF JSON, PNG/JPEG/KTX2, Ogg/WAV/MP3, TTF/OTF/WOFF/WOFF2, Radiance HDR/OpenEXR and JSON sprite sheets with nonempty `frames`. Classification checks container headers and does not guarantee decoder success. GLB needs its complete JSON chunk; MP3 needs a complete plausible MPEG Layer III frame, including after an optional ID3 tag.

An image classifies as `texture`; its authored use can be `sprite` or a texture file in a `material`. Material bundles and glTF dependencies such as `.bin` have no standalone magic identifying their logical use. Keep those files and their authored roles in the spec; do not invent a format from an extension or reject a supporting dependency merely because it classifies as `null`.

A game can keep `asset-import.json` next to its source media:

```json
{
  "id": "my-game/hero-material",
  "kind": "material",
  "files": [
    { "path": "materials/Hero/base.color.png", "role": "baseColor" },
    { "path": "materials/Hero/normal.png", "role": "normal" }
  ],
  "meta": { "license": "game-owned", "author": "Game team" }
}
```

A small pre-ingest check, saved as `scripts/check-custom-assets.ts`, can inspect both the contract and byte formats:

```ts
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { classifyAssetFile, validateImportSpec } from "@jgengine/assets/importSpec";

const specPath = resolve(process.argv[2] ?? "asset-import.json");
const result = validateImportSpec(JSON.parse(await readFile(specPath, "utf8")));
if (!result.ok) throw new Error(result.reason);
for (const file of result.entry.files) {
  const bytes = new Uint8Array(await readFile(resolve(dirname(specPath), file.path)));
  console.log(file.path, file.role ?? "", classifyAssetFile(bytes, file.path) ?? "unclassified dependency");
}
```

Run `bun scripts/check-custom-assets.ts path/to/asset-import.json`. Choose the loader from the detected bytes and the authored role, then copy into the game's owned public directory. The importing consumer owns its filesystem policy, including symlink handling, and must preserve metadata and licenses when it persists the entry. Model catalog extras already carry `dims`, `space`, `clips` and `collisionMesh`; keep those fields when registering a model.
