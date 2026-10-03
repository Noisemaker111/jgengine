import {strict as assert}from"node:assert";
import{mkdir,readFile,writeFile}from"node:fs/promises";
import{resolve,join}from"node:path";
import{importEditorDocumentJson,normalizeEditorLayers}from"@jgengine/core/editor/index";
import{createEditorHost}from"@jgengine/editor/session";
import{decodeEditorBridgeRequest}from"@jgengine/editor/mcp/rpcRequest";
const game=resolve(process.argv[2]!);const candidate=JSON.parse(await readFile(process.argv[3]! ,"utf8"));const evidence=resolve(process.argv[4]!);
const original=JSON.parse(await readFile(join(game,"src/editor.scene.json"),"utf8"));
let fullDocumentError="";try{importEditorDocumentJson(JSON.stringify(original));assert.fail("expected tracked dawn blocker");}catch(e){fullDocumentError=String(e);assert.ok(fullDocumentError.includes('$.environment.preset expected "day" | "dusk" | "night"'));}
const ids=new Set(original.prefabs.map((p:any)=>p.id));
// Actual-source slice deliberately scopes out environment (JGengine-games#46),
// while retaining every original prefab and its visible authored placement.
const slice={version:1,markers:original.markers.filter((m:any)=>ids.has(m.meta?.sourcePrefabId)),prefabs:original.prefabs,collections:original.collections.filter((c:any)=>ids.has(c.id)),volumes:[],paths:[],annotations:[],catalogs:[]};
const host=createEditorHost({gameId:"lantern-reach",layers:importEditorDocumentJson(JSON.stringify(slice))});
try{
 const session=host.api.getSession();const before=structuredClone(session.getState().document);
 for(const p of candidate.prefabs){const decoded=decodeEditorBridgeRequest({method:"set_prefab_static_bake",prefabId:p.id,bake:p.staticBake});assert.ok(decoded.ok);if(!decoded.ok)throw Error("RPC decoder rejected");assert.ok(host.api.handle(decoded.request).ok);}
 const authored=structuredClone(session.getState().document);assert.equal(authored.prefabs.filter(p=>p.staticBake).length,12);assert.deepEqual(authored.markers,before.markers);assert.deepEqual(authored.prefabs.map(p=>p.fragment),before.prefabs.map(p=>p.fragment));
 for(let i=0;i<12;i++)assert.ok(host.api.handle({method:"undo"}).ok);assert.deepEqual(session.getState().document,before);
 for(let i=0;i<12;i++)assert.ok(host.api.handle({method:"redo"}).ok);assert.deepEqual(session.getState().document,authored);
 await mkdir(join(evidence,"authored/lantern-reach/src"),{recursive:true});const exported=host.api.handle({method:"export_document"});assert.ok(exported.ok);const json=(exported.result as any).json;assert.equal(typeof json,"string");await writeFile(join(evidence,"authored/lantern-reach/src/editor.scene.json"),json);
 const reopened=importEditorDocumentJson(await readFile(join(evidence,"authored/lantern-reach/src/editor.scene.json"),"utf8"));const next=createEditorHost({gameId:"lantern-reach",layers:reopened});try{assert.deepEqual(next.api.getSession().getState().document,authored);}finally{next.dispose();}
 const report={scope:"actual12prefabs and12visible prefab placements; original source fragments, marker transforms and metadata preserved",rpcSettings:12,undos:12,redos:12,saveReopen:true,persistence:"packaged export_document RPC JSON -> disk -> strict importEditorDocumentJson -> packaged host reopen",fullDocumentError,fullDocumentBlocker:"https://github.com/Noisemaker111/JGengine-games/issues/46"};await writeFile(join(evidence,"authoring-evidence.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
}finally{host.dispose();}
