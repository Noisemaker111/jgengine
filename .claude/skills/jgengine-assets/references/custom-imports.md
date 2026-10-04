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

## Native material inspection

Use `inspectGltfMaterials(json, assetId)` from `@jgengine/assets/gltfMaterials` after validating glTF JSON, or `inspectGlbMaterials(bytes, assetId)` on complete GLB v2 bytes. It inventories each source material and mesh primitive separately, including duplicate names, unassigned primitives, node instances, alpha mode, attribution and native definitions. Its IDs use source indices inside the model namespace; pin original bytes before relying on those IDs across reimports. Display names remain useful selectors, but duplicate names need mesh or slot-index constraints.

The inspector records glTF packed channels: metallic/roughness B/G, occlusion R, clearcoat roughness G, sheen roughness A, specular intensity A, transmission R, volume thickness G, and anisotropy RG direction plus B strength. Color, emissive, sheen-color and specular-color textures are sRGB; numeric maps are linear. Base-color alpha is linear coverage within the color texture. It retains OpenGL normals, UV sets, `KHR_texture_transform` overrides, sampler settings and source image extension names. Embedded images keep their image/buffer-view identity without invented URLs. Physical texture size cannot be inferred from glTF and must be authored separately.

Compatibility follows the installed Three.js 0.182.0 loader, checked against its [r182 source](https://github.com/mrdoob/three.js/blob/r182/examples/jsm/loaders/GLTFLoader.js), rather than newer online documentation. Native imports support sheen, anisotropy, clearcoat, IOR/specular, transmission/volume, iridescence and dispersion. BasisU/KTX2 and compressed geometry still require configured decoders. Material variants require a separate loader plugin; legacy specular/glossiness has no native r182 implementation. Unsupported required extensions are errors; optional unsupported extensions are warnings. This inspection never downgrades native surfaces or decodes geometry.

Run `validateMaterialAssignmentTargets` from `@jgengine/shell/render/materialAsset` on the cached native model before texture hooks or clone allocation. It shares `applyMaterialAssignments`' selector, PBR, UV and construction checks without mutating or owning resources. Optional `disallowedTextureRoles` restricts referenced assets only; imported maps and unused library assets remain valid. `baseAlphaMode` reflects an earlier all-slot coverage override when checking named transmission. `EntityModel` runs this preflight automatically. Failed application restores original slot identities and disposes each created replacement once; successful replacements join the cloned model's cleanup ownership only after the whole assignment succeeds. If imported shader callbacks fail during construction, material assets and generic overrides release unreturned clones or promotions and preserve the original error even if cleanup throws. In-place overrides retain borrowed ownership and do not promise rollback of earlier property edits.

Check [Khronos material extensions](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos) for channel and combination contracts. In particular, [anisotropy](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_anisotropy) requires defined tangent space: normals plus tangents, or a normal texture with UVs from which tangents can be derived. Normal and anisotropy maps should share UVs. Directional surface highlights do not supply hair geometry, grooming or simulation.

Static prefab baking keeps imported material extensions already supported by its exporter. It records each source's exact `asset.copyright` in portable pins and joins unique copyright strings into the exported GLB; material extras remain attached to their surfaces. Provider license metadata supplied separately from glTF still belongs in the game's credits. Its report declares `materialLayout: "merged-by-source-material"`: optimization retains source material names but merges mesh primitives, so source mesh names, primitive indices and slot selectors must not be reused against the baked model. It rejects authored `materialAssignments` until export can reproduce those assignments, and retains the editable source instead of silently baking the original appearance. Procedural fabric shader detail and hair approximations need a separate export adapter or baked textures before they can be represented faithfully in glTF.
