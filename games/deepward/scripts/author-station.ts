/** Original Deepward station dressing, authored with the published editor session.
 * Run once from deepward with `bun scripts/author-station.ts`; runtime reads only the export.
 */
import { createEditorHost } from '@jgengine/editor/session';
import { readFileSync, writeFileSync } from 'node:fs';
const path = new URL('../src/editor.scene.json', import.meta.url);
const { session, api, dispose } = createEditorHost({ gameId: 'deepward', layers: JSON.parse(readFileSync(path, 'utf8')) });
const own = (v: { id: string; meta?: Record<string, unknown> }) => !v.id.startsWith('strata-') && (v.meta?.place === 'home' || v.meta?.place === 'vault');
const old = [...session.getState().document.volumes.filter(v => v.kind === 'deepward-structure' && own(v)), ...session.getState().document.markers.filter(v => v.kind === 'deepward-station-sign' && own(v))];
for (const v of old) session.dispatch({ type: 'remove', id: v.id });
let n = 0;
function box(place: string, role: string, at: number[], size: number[], color: string, surface = 'paint', turn = 0) {
 session.dispatch({ type: 'addVolume', volume: { id: `station-${place}-${role}-${++n}`, kind: 'deepward-structure', shape: 'box', center: {x:at[0]!,y:at[1]!,z:at[2]!}, halfExtents:{x:size[0]!/2,y:size[1]!/2,z:size[2]!/2}, color, label: role, meta:{place,surface,turn,solid:/canopy-leg|leg-foot|service-cabinet|spine-rib|receiving-gantry-leg/.test(role)} } });
}
function drum(place:string,role:string,at:number[],radius:number,height:number,color:string,turnX=0,turnZ=0) {
 session.dispatch({type:'addVolume', volume:{id:`station-${place}-${role}-${++n}`,kind:'deepward-structure',shape:'cylinder',center:{x:at[0]!,y:at[1]!,z:at[2]!},radius,height,color,label:role,meta:{place,surface:'steel',turnX,turnZ}}});
}
const enamel='#bdc5be', dark='#263739', yellow='#d59b48', steel='#9ba5a1', red='#9e513e';
// The rail canopy is a deep service portal, with a clear 4.8m route between its legs.
for (const [place,z,w,d] of [['home',8,5.6,3.8],['vault',0.7,5.6,4]] as const) {
 box(place,'canopy-roof',[0,3.42,z],[w,0.22,d],dark);
 for (const x of [-w/2,w/2]) {
  box(place,'canopy-leg',[x,1.65,z+0.4],[0.32,3.3,0.42],yellow);
  box(place,'leg-foot',[x,0.15,z+0.4],[0.54,0.3,0.68],dark);
  box(place,'canopy-sill',[x,3.18,z],[0.32,0.3,d],steel,'steel');
 }
 for (const dz of [-d/2,d/2]) box(place,'canopy-crossbeam',[0,3.13,z+dz],[w,0.32,0.32],yellow);
 for (const x of [-1.5,1.5]) box(place,'canopy-lamp',[x,3.05,z],[0.1,0.04,d-0.6],'#ffe4ae','lamp');
 for (const x of [-0.76,0.76]) box(place,'rail-channel',[x,0.015,z],[0.11,0.03,d+1.5],steel,'steel');
}
// Enamel service bays, exposed pipe runs and offset seams create depth on workshop walls.
for (const place of ['home','vault']) {
 const z=place==='home'?7.16:-8.88, w=place==='home'?6.6:7.7;
 for(const x of [-w,w]){
  box(place,'service-cabinet',[x,1.28,z+0.6],[0.58,2.56,1.3],enamel);
  box(place,'cabinet-inset',[x,1.4,z+1.27],[0.43,1.5,0.045],dark);
  for(const y of [0.8,1.05,1.3,1.55])box(place,'cabinet-louver',[x,y,z+1.32],[0.32,0.035,0.05],steel);
 }
 for(const x of [-4.5,4.5]){
  box(place,'wall-enamel-panel',[x,1.68,z],[3.3,2.7,0.12],enamel);
  box(place,'panel-base',[x,0.27,z+0.08],[3.3,0.38,0.18],dark);
  drum(place,'pipe-riser',[x,2,z+0.16],0.11,3.6,yellow);
 }
 drum(place,'service-header',[0,3.55,z+0.22],0.13,w*2-0.5,steel,0,Math.PI/2);
}
// Vault spine: suspended print conduits and alternating structural ribs above the route.
for(const z of [-11,-19,-27,-35,-42]){
 for(const x of [-2.75,2.75])box('vault','spine-rib',[x,1.95,z],[0.25,3.9,0.22],dark);
 box('vault','spine-lintel',[0,3.56,z],[5.5,0.35,0.22],yellow);
}
for(const x of [-1.95,1.95])drum('vault','ink-main',[x,3.45,-24],0.17,34,steel,Math.PI/2);
// Receiving gantry and packaging rollers retain unobstructed approaches to the salvage tray.
box('vault','receiving-gantry',[-4.9,3.15,-5],[4.8,0.32,3.8],red);
for(const x of [-7.2,-2.7])box('vault','receiving-gantry-leg',[x,1.55,-6.6],[0.23,3.1,0.28],red);
box('vault','hoist-track',[-4.9,2.93,-5],[0.1,0.12,3.5],steel,'steel');
box('vault','hoist-head',[-4.9,2.56,-5.7],[0.55,0.52,0.42],yellow);
// Pump gallery pressure vessels, collars and paired service platforms.
for(const x of [-5.8,5.8]){
 drum('vault','pressure-vessel',[x,1.9,-28],0.72,2.8,enamel);
 for(const y of [0.58,1.72,2.95])drum('vault','vessel-collar',[x,y,-28],0.79,0.16,dark);
 drum('vault','vessel-neck',[x,3.48,-28],0.23,0.7,yellow);
 box('vault','pump-service-deck',[x,0.08,-28],[3.5,0.16,4.5],dark);
}
// Printing press ribs and an ink manifold make the press a station-sized silhouette.
for(const z of [-40.2,-38]){
 for(const x of [-6.1,-3.5])box('vault','press-upright',[x,1.8,z],[0.28,3.6,0.32],yellow);
 box('vault','press-crosshead',[-4.8,3.48,z],[3.2,0.3,0.42],steel,'steel');
}
box('vault','print-chamber',[-4.8,2.28,-39],[2.3,0.58,1.9],enamel);
for(const z of [-40,-39.5,-39,-38.5,-38])drum('vault','print-roller',[-4.8,0.9,z],0.12,2.3,steel,0,Math.PI/2);
for(const x of [3.8,4.6,5.4,6.2])drum('vault','ink-reservoir',[x,1.1,-43],0.31,2.2,'#9279aa');
// Repeatable human-scale gauge plaques have durable marker positions too.
for(const [id,x,z,title,sub,turn] of [
 ['station-route-receiving',4.8,-8.72,'01 / RECEIVING','COPPER / SHIFT STOCK',0],
 ['station-route-stores',-7.72,-16,'02 / SHIFT STORES','SEALS + POWER CELLS',Math.PI/2],
 ['station-route-pumps',7.72,-27,'03 / PRESSURE HALL','RETURN RAIL  ↑',-Math.PI/2],
 ['station-route-press',0,-43.72,'04 / PRINT WORKS','HALLOWAY / FITTER PATTERN',0],
] as const) {
 const result=api.handle({method:'add_marker',id,kind:'deepward-station-sign',x,y:2.5,z,rotationY:turn,label:title,meta:{place:id.includes('home')?'home':'vault',subtitle:sub,width:2.6}});
 if(!result.ok)throw Error(JSON.stringify(result));
}
// D0.3 content pass: one landmark per zone, depth off the rail route and wall dressing that
// reads at eye height. Every part stays outside the walked centre of each room; the only new
// solid pieces are wall-hugging benches and shelf bays.
// Marrow workshop: a tool bay on the west wall and a service trunk overhead.
for (const z of [15.4,16.9]) box('home','bench-unit',[-6.5,0.52,z],[1.1,1.04,1.3],enamel);
box('home','bench-top',[-6.46,1.08,16.15],[1.25,0.09,2.95],steel,'steel');
for (const z of [15.2,16.15,17.1]) box('home','pegboard-panel',[-6.86,2.02,z],[0.05,1.15,0.78],dark);
for (const [z,h] of [[15.05,0.42],[15.5,0.6],[16.05,0.34],[16.6,0.52],[17.02,0.44]] as const) box('home','tool-shadow',[-6.78,1.86,z],[0.05,h,0.07],yellow);
box('home','bench-lamp',[-6.4,2.72,16.15],[0.34,0.05,1.9],'#ffe4ae','lamp');
box('home','trunk-duct',[3.5,3.5,13.2],[1.15,0.5,10.6],steel,'steel');
box('home','trunk-hanger',[3.5,3.2,13.2],[0.5,0.12,10.6],dark);
box('home','walk-line-w',[-0.92,0.014,11.4],[0.1,0.028,5.4],yellow,'lamp');
box('home','walk-line-e',[0.92,0.014,11.4],[0.1,0.028,5.4],yellow,'lamp');
// Rail receiving: pallet banks inside the two back corners and a mirrored gantry over the desk.
for (const [x,z,n] of [[6.6,-7.4,3],[7.1,-6.1,2],[-7.3,-7.5,3]] as const)
 for (let i=0;i<n;i++) box('vault','pallet-stack',[x,0.3+i*0.58,z],[1.15,0.56,1.15],i%2===0?enamel:dark);
box('vault','receiving-gantry-east',[4.9,3.15,-5],[4.4,0.3,3.6],red);
for(const x of [2.85,6.95])box('vault','receiving-gantry-leg',[x,1.55,-6.5],[0.22,3.1,0.26],red);
box('vault','hoist-track-east',[4.9,2.93,-5],[0.09,0.11,3.3],steel,'steel');
box('vault','hoist-head-east',[4.9,2.52,-5.9],[0.5,0.48,0.4],yellow);
box('vault','gate-stile-w',[-2.5,1.55,2.6],[0.24,3.1,0.3],yellow);
box('vault','gate-stile-e',[2.5,1.55,2.6],[0.24,3.1,0.3],yellow);
box('vault','gate-head',[0,3.16,2.6],[5.25,0.3,0.3],dark);
// Shift stores: shelving bays against the west wall with bin lips, and a crate stack in the far corner.
for (const z of [-20.4,-18.1,-15.8,-13.5]) {
 box('vault','store-shelf',[-7.5,1.1,z],[0.9,2.2,1.95],enamel);
 for (const y of [0.42,0.96,1.5]) box('vault','shelf-lip',[-6.98,y,z],[0.12,0.06,1.98],steel,'steel');
 box('vault','bin-card',[-6.99,1.62,z-0.72],[0.06,0.24,0.42],dark);
}
for(let i=0;i<3;i++)box('vault','crate-stack',[-7.15,0.32+i*0.62,-21.2],[1.05,0.6,1.0],i%2===0?dark:enamel);
box('vault','cage-light-stores',[-5,3.62,-17.2],[0.55,0.05,7.6],'#a4ded2','lamp');
box('vault','cage-housing-stores',[-5,3.71,-17.2],[0.75,0.12,7.9],dark);
// Pump gallery: an east manifold with gauges and transverse ducts overhead.
drum('vault','manifold-header',[7.4,1.5,-28],0.17,2.7,steel);
for(const z of [-30.4,-28,-25.6]){
 drum('vault','manifold-branch',[6.6,2.35,z],0.1,1.6,yellow,0,Math.PI/2);
 drum('vault','gauge-face',[6.05,1.62,z],0.2,0.08,enamel,Math.PI/2,0);
}
for(const z of [-30.6,-25.4]) box('vault','hall-duct',[0,3.5,z],[15,0.52,0.82],steel,'steel');
// Printhouse: a press flywheel, a paper-roll bank and a caged vent.
drum('vault','press-flywheel',[-4.8,2.05,-41.4],1.3,0.44,steel,Math.PI/2,0);
drum('vault','press-hub',[-4.8,2.05,-41.4],0.34,0.62,yellow,Math.PI/2,0);
box('vault','press-backbone',[-4.8,1.9,-42.35],[2.9,3.7,0.34],dark);
for(let i=0;i<3;i++)drum('vault','paper-roll',[7.0,0.72+i*0.66,-35.6+i*0.4],0.62,1.9,enamel,Math.PI/2);
for(const [x,z] of [[3.2,-41.7],[6.8,-41.7],[3.2,-35.3],[6.8,-35.3]])box('vault','vent-post',[x,1.4,z],[0.16,2.8,0.16],red);
box('vault','vent-header',[5,2.76,-41.7],[3.9,0.16,0.16],red);
// Return spine: amber walk edges, a low conduit run and junction boxes down the whole return.
for(let z=-4;z>=-42;z-=4){
 box('vault','spine-edge-w',[-2.55,0.014,z-1.5],[0.09,0.028,2.6],yellow,'lamp');
 box('vault','spine-edge-e',[2.55,0.014,z-1.5],[0.09,0.028,2.6],yellow,'lamp');
}
for(const x of [-2.82,2.82])drum('vault','spine-conduit',[x,1.18,-23.5],0.07,37,'#9e513e',Math.PI/2);
for(let z=-6;z>=-42;z-=6){
 box('vault','junction-box',[-2.86,1.62,z],[0.14,0.42,0.34],dark);
 box('vault','junction-box',[2.86,1.62,z],[0.14,0.42,0.34],dark);
}
// Wall wayfinding: room identity read at eye height from each doorway and from the return walk.
for(const [id,x,z,title,sub,turn] of [
 ['station-route-workshop',-6.85,15.2,'WORKSHOP 06','TOOL BAY / STASH WEST',Math.PI/2],
 ['station-route-stores-wall',-7.85,-17,'SHIFT STORES','SEALS + CELLS / SHELF 02',Math.PI/2],
 ['station-route-pumps-wall',-7.85,-28,'PRESSURE 3.4','DO NOT ISOLATE THE HEADER',Math.PI/2],
 ['station-route-press-wall',-7.85,-37.5,'PATTERN 406','FITTER / HALLOWAY PRESS',Math.PI/2],
 ['station-route-return-mid',0,-21.5,'RETURN RAIL','21 M / MARROW',Math.PI],
] as const) {
 const result=api.handle({method:'add_marker',id,kind:'deepward-station-sign',x,y:2.5,z,rotationY:turn,label:title,meta:{place:id.includes('home')||id.includes('workshop')?'home':'vault',subtitle:sub,width:2.4}});
 if(!result.ok)throw Error(JSON.stringify(result));
}

writeFileSync(path, session.exportJson(true)+'\n');
console.log(api.handle({method:'scene_summary'}));dispose();
