/** Game-owned source selection; shared @jgengine/assets owns prefab baking (#1937). */
import { readFile, writeFile } from "node:fs/promises";
import { bakeStaticPrefab } from "@jgengine/assets/staticPrefabBake";
import { importEditorDocumentJson } from "@jgengine/core/editor/index";

const check = process.argv.includes("--check");
const game = new URL("../", import.meta.url);
const manifestFile = new URL("scripts/model-provenance.json", game);
const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
const scene = importEditorDocumentJson(await readFile(new URL("src/editor.scene.json", game), "utf8"));
// Image URIs are declared by the source GLB; only reviewed manifest entries can
// supply them. The shared baker validates source bytes and exact texture roles.
const sources = await Promise.all(manifest.models.filter((asset: any) => asset.dims && !asset.authoredFile).map(async (asset: any) => {
  const path = new URL(`public/models/lantern-reach/${asset.path}`, game).pathname;
  const bytes = await readFile(path);
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  return {
    catalogId: `lantern:${asset.path.split("/").at(-1).slice(0, -4)}`,
    path, sha256: asset.sha256, bytes: asset.bytes,
    textures: (gltf.images ?? []).filter((image: any) => image.uri).map((image: any) => {
      const texture = manifest.models.find((entry: any) => entry.path === `scenery/${image.uri}`);
      if (!texture) throw new Error(`Unpinned material image ${image.uri}`);
      return { uri: image.uri, path: new URL(`public/models/lantern-reach/${texture.path}`, game).pathname,
        sha256: texture.sha256, bytes: texture.bytes, url: `/models/lantern-reach/${texture.path}` };
    }),
  };
}));
for (const asset of manifest.models.filter((entry: any) => entry.authoredFile)) {
  const prefab = scene.prefabs.find((entry) => entry.id === asset.sourcePrefabId);
  if (!prefab?.staticBake) throw new Error(`Author static bake settings for ${asset.sourcePrefabId}`);
  const result = await bakeStaticPrefab(prefab, sources);
  const metadata = { bytes: result.report.bytes, sha256: result.report.sha256, sourcePrefabSha256: result.report.sourcePrefabSha256,
    draws: result.report.submissions, dims: result.dims, anchor: result.anchor, space: result.space, collisionMesh: result.collisionMesh,
    bakeReport: result.report };
  const artifact = new URL(asset.authoredFile, manifestFile);
  if (check) {
    const committed = await readFile(artifact);
    if (!committed.equals(Buffer.from(result.bytes)) || Object.entries(metadata).some(([key, value]) => JSON.stringify(asset[key]) !== JSON.stringify(value))) {
      throw new Error(`Stale export ${asset.path}: rerun without --check`);
    }
  } else {
    await writeFile(artifact, result.bytes);
    Object.assign(asset, metadata);
  }
  console.log(`${check ? "Verified" : "Exported"} ${asset.path}: ${metadata.draws} material groups, ${metadata.bytes} bytes`);
}
if (!check) await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
