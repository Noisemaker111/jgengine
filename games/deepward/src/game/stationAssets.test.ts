import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { editorLayers, PROPS, walkable } from '../world';
import surfaceManifest from '../../public/models/imported/deepward/surfaces/asset-manifest.json';
import { actorAssetManifest, stationAssetManifest, stationAssets } from './assets';

// Validate the shipped bytes and the real editor/catalog contract, not a mock model listing.
test('all authored station assets are shipped intact with embedded PBR maps',()=>{
 const markers=editorLayers.markers.filter(m=>m.kind==='deepward-station-model');
 expect(markers).toHaveLength(10);
 expect(new Set(markers.map(m=>m.catalogId)).size).toBe(stationAssetManifest.models.length);
 let triangles=0;
 for(const marker of markers){
  expect(stationAssets.resolve(marker.catalogId!)?.url).toBeTruthy();
  triangles+=stationAssetManifest.models.find(m=>m.id===marker.catalogId)!.triangles;
 }
 expect(triangles).toBeLessThan(500_000);
 for(const model of stationAssetManifest.models){
  const bytes=readFileSync(new URL(`../../public/models/imported/deepward/${model.file}`,import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(model.sha256);
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);expect(bytes.readUInt32LE(4)).toBe(2);expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  expect(json.images.length).toBeGreaterThan(3);
  for(const image of json.images){expect(image.uri).toBeUndefined();expect(typeof image.bufferView).toBe('number');}
  for(const material of json.materials.filter((m:any)=>m.pbrMetallicRoughness?.baseColorTexture))expect(material.normalTexture).toBeTruthy();
  expect(model.minY).toBeCloseTo(model.bounds.min[1]!,4);expect(model.minY).toBeGreaterThanOrEqual(0);expect(model.minY).toBeLessThanOrEqual(0.025);expect(model.staticDrawCalls).toBeLessThanOrEqual(10);
 }
});
test('detailed machinery fits its authoritative blockers and rail portals keep the opening clear',()=>{
 for(const marker of editorLayers.markers.filter(m=>m.kind==='deepward-station-model')){
  const model=stationAssetManifest.models.find(m=>m.id===marker.catalogId)!;
  const blocker=PROPS.find(p=>p.id===marker.meta?.sourceId);
  if(blocker){
   expect(model.footprint[0]!).toBeLessThanOrEqual(blocker.w+0.01);
   expect(model.footprint[1]!).toBeLessThanOrEqual(blocker.d+0.01);
  }
  if(marker.meta?.sourceId==='rail-canopy')for(let x=-2;x<=2;x+=0.5)expect(walkable(marker.position.x+x,marker.position.z,marker.meta.place as 'home'|'vault')).toBe(true);
 }
});

test('original Fitter skin and weapon assets are shipped intact through the catalog',()=>{
 for(const model of actorAssetManifest.models){
  expect(stationAssets.resolve(model.id)?.url).toBe(model.url);
  const bytes=readFileSync(new URL(`../../public/models/imported/deepward/fitter/${model.file}`,import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(model.sha256);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  expect(json.images.every((image:any)=>image.uri===undefined&&typeof image.bufferView==='number')).toBe(true);
  if(model.id==='deepward/fitter-salvage-operator'){
   expect(json.skins[0].joints).toHaveLength(17);
   expect(json.animations.map((clip:any)=>clip.name).sort()).toEqual(['idle','walk','windup']);
   expect(json.animations.every((clip:any)=>clip.channels.length>=17)).toBe(true);
   expect(model.bounds.min[1]).toBe(0);expect(model.dims[1]).toBeCloseTo(1.87,2);
  }else{
   expect(model.bounds.min[2]).toBeLessThanOrEqual(model.id.endsWith('sidearm')?-0.22:-0.5);
   expect(model.bounds.max[1]).toBeGreaterThan(0);expect(model.bounds.min[1]).toBeLessThan(0);
  }
 }
});


test('original station surface maps are shipped with the declared roles and color spaces',()=>{
 expect(surfaceManifest.images).toHaveLength(6);
 for(const image of surfaceManifest.images){
  const bytes=readFileSync(new URL(`../../public/models/imported/deepward/surfaces/${image.file}`,import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256);
  expect(bytes.subarray(1,4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(256);expect(bytes.readUInt32BE(20)).toBe(256);
  expect(image.colorSpace).toBe(image.role==='color'?'srgb':'linear');
 }
});
