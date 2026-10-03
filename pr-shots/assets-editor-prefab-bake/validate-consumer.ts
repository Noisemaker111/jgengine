import { compareGeometry } from "./compare-geometry";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { bakeStaticPrefab, type StaticPrefabSource } from "@jgengine/assets/staticPrefabBake";
import { importEditorDocumentJson, exportEditorDocumentJson, normalizeEditorLayers } from "@jgengine/core/editor/index";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { createObjectStore } from "@jgengine/core/scene/objectStore";
import { fittedObjectColliders } from "@jgengine/core/scene/colliders";
import { placeAuthoredObjectsFromDocument } from "@jgengine/core/world/authoredObjects";
import { createObstacleReachCache, resolveSourceWalkerStep } from "@jgengine/core/movement/solidObstacles";
import { contextModels } from "@jgengine/shell/render/resolveModel";

const game = resolve(process.argv[2]!);
const candidateScene = resolve(process.argv[3]!);
const outputDir = resolve(process.argv[4]!);
await mkdir(outputDir, { recursive: true });
const manifest = JSON.parse(await readFile(join(game, "scripts/model-provenance.json"), "utf8"));
// Existing shipped Lantern loader uses normalizeEditorLayers; this bake-only
// proof intentionally mirrors that loader. Strict full-document save is tested separately.
const scene = normalizeEditorLayers(JSON.parse(await readFile(candidateScene, "utf8")));
const reopened = importEditorDocumentJson(exportEditorDocumentJson({version:1,prefabs:scene.prefabs,markers:[],volumes:[],paths:[],annotations:[],collections:[],catalogs:[]}));
assert.deepEqual(reopened.prefabs.map(p => p.staticBake), scene.prefabs.map(p => p.staticBake));
const gltf = (bytes: Buffer | Uint8Array) => { const b=Buffer.from(bytes); return JSON.parse(b.subarray(20, 20+b.readUInt32LE(12)).toString()); };
const sources: StaticPrefabSource[] = await Promise.all(manifest.models.filter((a:any) => a.dims && !a.authoredFile).map(async(a:any) => {
  const path = join(game, "public/models/lantern-reach", a.path);
  const source = gltf(await readFile(path));
  return { catalogId: `lantern:${a.path.split("/").at(-1).slice(0,-4)}`, path, sha256:a.sha256, bytes:a.bytes,
    textures:(source.images??[]).filter((i:any)=>i.uri).map((i:any)=> {
      const texture=manifest.models.find((a:any)=>a.path===`scenery/${i.uri}`);assert.ok(texture);
      return {uri:i.uri,path:join(game,"public/models/lantern-reach",texture.path),sha256:texture.sha256,bytes:texture.bytes,url:`/models/lantern-reach/${texture.path}`};
    }) };
}));
const catalog=createAssetCatalog();
for(const a of manifest.models.filter((a:any)=>a.dims))catalog.register(`lantern:${a.path.split("/").at(-1).slice(0,-4)}`,{url:`/models/lantern-reach/${a.path}`,dims:a.dims,anchor:"origin"});
const results=[];
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
function normalizeMaterial(source:any,value:any):any {
  if(!value||typeof value!=="object")return value;
  if(Array.isArray(value))return value.map(v=>normalizeMaterial(source,v));
  const out:any={};for(const [key,v]of Object.entries(value)) {
    if(key==="name"||key==="extras")continue;
    if(key==="index"&&typeof v==="number")out[key]=source.images[source.textures[v].source].uri;
    else out[key]=normalizeMaterial(source,v);
  }return out;
}
function materials(source:any){return (source.materials??[]).map((m:any)=>JSON.stringify(canonical(normalizeMaterial(source,m)))).sort();}
for(const a of manifest.models.filter((a:any)=>a.authoredFile)) {
  const prefab=scene.prefabs.find(p=>p.id===a.sourcePrefabId)!;assert.ok(prefab.staticBake);
  const result=await bakeStaticPrefab(prefab,sources);
  const again=await bakeStaticPrefab(prefab,sources);
  assert.deepEqual(again.bytes,result.bytes,"bake bytes must be deterministic");
  const oldBytes=await readFile(join(game,"public/models/lantern-reach",a.path));
  const old=gltf(oldBytes);
  const geometryComparison=compareGeometry(result.bytes,oldBytes);
  const next=gltf(result.bytes);
  assert.deepEqual([...new Set(materials(next))],[...new Set(materials(old))],`source PBR/material URLs changed for ${prefab.id}`);
  console.log("COMPARE",prefab.id,geometryComparison,"draws",a.draws,"->",result.report.submissions);
  assert.ok(result.report.submissions<=12);
  for(const [part,dims]of Object.entries(result.dims)) {
    if(typeof dims==="object")for(const [axis,value]of Object.entries(dims))assert.ok(Math.abs((value as number)-a.dims[part][axis])<1e-4,`${prefab.id} ${part}.${axis}`);
    else assert.ok(Math.abs((dims as number)-a.dims[part])<1e-4,`${prefab.id} ${part}`);
  }
  assert.equal(result.report.sourcePrefabSha256,createHash("sha256").update(JSON.stringify(prefab.fragment)).digest("hex"));
  for(const image of next.images??[])assert.ok(manifest.models.some((a:any)=>image.uri===`/models/lantern-reach/${a.path}`));
  catalog.register(result.report.assetId,{url:`/models/lantern-reach/${a.path}`,dims:result.dims,anchor:result.anchor,space:result.space,collisionMesh:result.collisionMesh});
  await writeFile(join(outputDir,a.path.split("/").at(-1)),result.bytes);
  await writeFile(join(outputDir,a.path.split("/").at(-1)+".report.json"),JSON.stringify(result.report,null,2)+"\n");
  a.draws=result.report.submissions;a.sourcePrefabSha256=result.report.sourcePrefabSha256;a.bytes=result.report.bytes;a.sha256=result.report.sha256;a.dims=result.dims;a.anchor=result.anchor;a.space=result.space;a.collisionMesh=result.collisionMesh;a.bakeReport=result.report;
  results.push({geometryComparison,oldSubmissions:old.meshes.reduce((n:number,m:any)=>n+m.primitives.length,0),id:prefab.id,submissions:result.report.submissions,triangles:result.report.triangles,bytes:result.report.bytes,sha256:result.report.sha256});
}
// Exercise the same shared model catalog lookup used by the actual runtime and
// movement, without an objectModels map or game-owned renderer.
const models=contextModels({game:{assets:catalog}} as any)!;
const store=createObjectStore();
placeAuthoredObjectsFromDocument(store,scene,()=>0);
for(const marker of scene.markers.filter(m=>m.catalogId)) {
  const placed=store.get(`editor:${marker.id}`)??store.list().find(o=>o.catalogId===marker.catalogId&&o.position[0]===marker.position.x&&o.position[2]===marker.position.z);
  assert.ok(placed,`runtime missing authored marker ${marker.id}`);
  assert.equal(placed.position[0],marker.position.x);assert.equal(placed.position[2],marker.position.z);
  assert.equal(models.object!(marker.catalogId!)!.anchor,"origin");
}
const source={list:store.list,inBox:store.inBox,collidersOf:(id:string)=>fittedObjectColliders(models.object!(store.get(id)!.catalogId)!)};
const cache=createObstacleReachCache();
const step=(x:number,z:number,dx:number,dz:number)=>resolveSourceWalkerStep(source,cache,[x,0,z],dx,dz,{radius:.35,stepUpHeight:.3});
for(const marker of scene.markers.filter(m=>m.id.startsWith("architecture:settlement-"))) {
  const prefab=scene.prefabs.find(p=>p.id===marker.meta?.sourcePrefabId)!;
  const door=prefab.fragment.markers.find(p=>p.catalogId==="lantern:Door_4_Round")!;
  const dims=models.object!(marker.catalogId!)!.dims!;
  const x=marker.position.x+door.position.x;const front=marker.position.z+dims.center.z+dims.footprint.d/2;
  let z=front+2;
  for(let t=0;t<14;t++){const move=step(x,z,0,-.1);assert.ok(Math.abs(move.stepZ+.1)<1e-6);z+=move.stepZ;}
  assert.ok(step(x,z,0,-1).stepZ>-.3,`closed exterior lost for ${marker.id}`);
}
const start=scene.markers.find(m=>m.id==="spawn:player")!.position;
const queue:[number,number][]=[[start.x,start.z]];const key=(x:number,z:number)=>`${x},${z}`;const visited=new Set([key(start.x,start.z)]);
const residents=["marshal_redbrook","wilkes_hand","apothecary_lin","trader_wilkes","brother_aldric","fisherman_brandt","foreman_odell"].map(id=>scene.markers.find(m=>m.id===`npc:${id}`)!.position);
for(let head=0;head<queue.length&&!residents.every(t=>visited.has(key(t.x,t.z)));head++) {
  const [x,z]=queue[head]!;
  for(const [dx,dz]of [[.5,0],[-.5,0],[0,.5],[0,-.5]]) {
    const nx=x+dx!,nz=z+dz!;if(nx< -30||nx>30||nz< -330||nz> -265||visited.has(key(nx,nz)))continue;
    const m=step(x,z,dx!,dz!);if(Math.abs(m.stepX-dx!)>1e-6||Math.abs(m.stepZ-dz!)>1e-6)continue;
    visited.add(key(nx,nz));queue.push([nx,nz]);
  }
}
for(const target of residents)assert.ok(visited.has(key(target.x,target.z)),"unreachable authored resident");
await writeFile(join(outputDir,"model-provenance.candidate.json"),JSON.stringify(manifest,null,2)+"\n");
await writeFile(join(outputDir,"consumer-results.json"),JSON.stringify({packages:"isolated package tarballs",prefabs:results,closedExteriors:11,reachableResidents:residents.length,authoredProps:store.list().length,visualClaim:"unproven; capture stopped after two failures"},null,2)+"\n");
console.log(JSON.stringify({prefabs:results,closedExteriors:11,reachableResidents:residents.length,authoredProps:store.list().length},null,2));
