/** Attach the original model catalog to durable editor markers. No runtime placement code. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createEditorHost } from '@jgengine/editor/session';
const scenePath=new URL('../src/editor.scene.json',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('../public/models/imported/deepward/asset-manifest.json',import.meta.url),'utf8'));
const {session,api,dispose}=createEditorHost({gameId:'deepward',layers:JSON.parse(readFileSync(scenePath,'utf8')),assets:manifest.models.map((m:any)=>({id:m.id,label:m.id,kind:'model',url:m.url}))});
for(const marker of session.getState().document.markers.filter(m=>m.kind==='deepward-station-model'))session.dispatch({type:'remove',id:marker.id});
if(session.getState().document.volumes.some(v=>v.id==='machine-receiving-desk'))session.dispatch({type:'remove',id:'machine-receiving-desk'});
const doc=session.getState().document;
function anchor(id:string) {const m=doc.markers.find(m=>m.id===id);if(!m)throw Error(id);return m.position;}
function machine(id:string) {const v=doc.volumes.find(v=>v.id===id);if(!v)throw Error(id);return v.center;}
function place(id:string,model:string,at:{x:number;y:number;z:number},home:boolean,sourceId:string,replaces:string[]=[],turn=0) {
 if(!manifest.models.some((m:any)=>m.id===`deepward/${model}`))throw Error(model);
 const r=api.handle({method:'add_marker',id,kind:'deepward-station-model',catalogId:`deepward/${model}`,x:at.x,y:0,z:at.z,rotationY:turn,label:model,meta:{place:home?'home':'vault',sourceId,replaces}});
 if(!r.ok)throw Error(JSON.stringify(r));
 // Editor0.18.0's marker RPC predates catalogId; its session command owns that field.
 const marker=session.getState().document.markers.find(m=>m.id===id)!;
 const entry=manifest.models.find((m:any)=>m.id===`deepward/${model}`)!;
 session.dispatch({type:'setMarker',id,patch:{catalogId:entry.id,meta:{...marker.meta,assetId:entry.id,url:entry.url}}});
}
const portalRoles=['canopy-roof','canopy-leg','leg-foot','canopy-sill','canopy-crossbeam','canopy-lamp'];
for(const home of [true,false]){
 const service=anchor(home?'rail-garage':'rail-extraction');
 const canopy=doc.volumes.find(v=>v.label==='canopy-roof'&&v.meta?.place===(home?'home':'vault'));
 if(!canopy)throw Error('Missing canopy');
 place(`station-model-${home?'marrow':'bellwether'}-portal`,'marrow-receiving-portal',canopy.center,home,'rail-canopy',portalRoles);
 place(`station-model-${home?'marrow':'bellwether'}-trolley`,'marrow-rail-transfer',{...service,z:service.z+(home?-0.7:0.5)},home,home?'rail-garage':'rail-extraction',[],home?0:Math.PI);
}
const stash=anchor('stash-marrow');
place('station-model-stash','marrow-stash-cabinet',{...stash,x:stash.x-0.4},true,'stash-marrow');
place('station-model-marrow-printer','marrow-salvage-printer',anchor('decor-home-printer'),true,'decor-home-printer');
place('station-model-bellwether-press','bellwether-rotary-press',machine('machine-printer'),false,'machine-printer',['press-upright','press-crosshead','print-chamber','print-roller']);
for(const id of ['machine-pump-west','machine-pump-east'])place(`station-model-${id}`,'duplex-ink-recovery',machine(id),false,id,['pressure-vessel','vessel-collar','vessel-neck','pump-service-deck']);
// A receiving dispatch desk sits outside the return spine, never across the rail.
const receiving=doc.volumes.find(v=>v.id==='room-rail-receiving')!;
const desk={x:receiving.center.x+receiving.halfExtents!.x*0.6,y:0,z:anchor('loot-wire').z};
place('station-model-receiving-dispatch','marrow-service-desk',desk,false,'machine-receiving-desk');
session.dispatch({type:'addVolume',volume:{id:'machine-receiving-desk',kind:'deepward-machine',shape:'box',center:{...desk,y:0.82},halfExtents:{x:1.15,y:0.82,z:0.55},label:'Receiving dispatch desk',meta:{modelSource:'station-model-receiving-dispatch'}}});
writeFileSync(scenePath,session.exportJson(true)+'\n');console.log(api.handle({method:'scene_summary'}));dispose();
