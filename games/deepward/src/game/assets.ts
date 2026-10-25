import { createAssetCatalog } from '@jgengine/core/scene/assetCatalog';
import fitterManifest from '../../public/models/imported/deepward/fitter/asset-manifest.json';
import manifest from '../../public/models/imported/deepward/asset-manifest.json';

/** Original CC0 models exported by our reproducible machinery authoring tool. */
export const stationAssetManifest = manifest;
export const stationAssets = createAssetCatalog();
export const actorAssetManifest = fitterManifest;
for (const model of [...manifest.models,...fitterManifest.models]) {
 stationAssets.register(model.id, { url:model.url, dims:{
  footprint:{w:model.dims[0]!,d:model.dims[2]!},
  center:{x:(model.bounds.min[0]!+model.bounds.max[0]!)/2,z:(model.bounds.min[2]!+model.bounds.max[2]!)/2},
  minY:model.bounds.min[1]!,maxY:model.bounds.max[1]!,
 }});
}
