import type { AssetCatalog } from '@jgengine/core/scene/assetCatalog';
import { IsolatedEntityModel } from '@jgengine/shell/render/SceneModels';
import { editorLayers, type Place } from '../world';

export function stationModelMarkers(place: Place) {
 return editorLayers.markers.filter(marker => marker.kind === 'deepward-station-model' && marker.meta?.place === place);
}
export function stationModelReplacements(place: Place): Set<string> {
 return new Set(stationModelMarkers(place).flatMap(marker => {
  const labels=marker.meta?.replaces;
  if(labels===undefined)return [];
  if(!Array.isArray(labels)||!labels.every(label=>typeof label==='string'))throw Error(`Invalid authored replacement links: ${marker.id}`);
  return labels as string[];
 }));
}
export function hasStationModel(place: Place, sourceId: string): boolean {
 return stationModelMarkers(place).some(marker => marker.meta?.sourceId === sourceId);
}
/** Catalog models render at authored marker transforms, with their original floor origin.
 * The room/machine/column volumes remain the single gameplay/collision authority.
 */
export function StationModels({ place, assets }: { place: Place; assets: AssetCatalog }) {
 return <>{stationModelMarkers(place).map(marker=>{
  const asset = marker.catalogId ? assets.resolve(marker.catalogId) : null;
  if(!asset)throw Error(`Unresolved Deepward station model: ${marker.id} / ${marker.catalogId}`);
  return <group key={marker.id} position={[marker.position.x,marker.position.y,marker.position.z]} rotation-y={marker.rotationY??0}>
   <IsolatedEntityModel model={{...asset,y:-(asset.dims?.minY ?? 0),anchor:'origin',shadows:'both',animation:'none'}} />
  </group>;
 })}</>;
}
