import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { pathFollowSeek } from "@jgengine/core/nav/pathFollow";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Box3, Group, Mesh, MeshStandardMaterial, Object3D, Plane, Raycaster, TextureLoader, Vector2, Vector3 } from "three";
import motionJson from "../../../public/art/models/motion.json";
import { objectModels } from "../models";
import { session } from "../session";
import { cellCentres, cellFor, park, parkObject, parkObjects, patrolRadius, type ParkObject } from "../park";
import { BUILDABLES } from "../objects/catalog";
import { coasterCircuit, rideView } from "../rides";
import { placementAt } from "../build/placement";
import { GRID, snapToGrid } from "../catalog";
import { traceNative } from "../evidence";
import { hoverRefusal, placementHintStore } from "../build/placementHint";
import { SceneCaptureBinding } from "@jgengine/shell/render/sceneCapture";
import { bindParkCapture } from "../parkProfile";
import { cellAt, cellCentre, groundAt, isLandTool, LEVEL_HEIGHT, lineCells, raisedCells, rectCells } from "../build/terrain";
import { landCheck, LINE_KINDS } from "../build/commands";

/** Each moving ride part: its own GLB whose origin is the pivot, and how it moves (spin, wheel, swing, drop). */
type MotionSpec = { model: string; kind: "spin" | "wheel" | "swing" | "drop"; pivot: [number, number, number]; speed: number; amplitude?: number; level?: string };
const MOTION = motionJson as unknown as Record<string, MotionSpec>;
const motionUrl = (model: string) => new URL(`../../../public/art/models/${model}.glb`, import.meta.url).href;
function RideMotion({object}:{object:ParkObject}) {
  const spec=MOTION[object.kind]!;
  const gltf=useLoader(GLTFLoader,motionUrl(spec.model));
  const clock=useGameStore(ctx=>ctx.time);
  const reduced=useGameStore(ctx=>Boolean(ctx.game.store.get("park.reduced-motion")));
  const ctx=useGameContext();
  const ref=useRef<Group>(null);
  const scene=useMemo(()=>{const copy=gltf.scene.clone();copy.traverse(n=>{if(n instanceof Mesh){n.castShadow=true;n.receiveShadow=true;}});return copy;},[gltf]);
  const levels=useMemo(()=>{const out:Object3D[]=[];if(spec.level)scene.traverse(n=>{if(n.name.startsWith(spec.level!))out.push(n);});return out;},[scene,spec.level]);
  const amplitude=spec.amplitude??1;
  useFrame(()=>{
    const root=ref.current; if(!root)return;
    // A broken or idle ride stands still; one running its cycle moves.
    const view=rideView(object.id);
    const moving=!reduced&&view!==null&&view.phase!=="broken"&&view.phase!=="idle";
    const t=moving?clock.now():0;
    if(spec.kind==="spin") root.rotation.y=t*spec.speed;
    if(spec.kind==="wheel") {root.rotation.x=t*spec.speed;for(const cabin of levels)cabin.rotation.x=-root.rotation.x;}
    if(spec.kind==="swing") root.rotation.x=Math.sin(t*spec.speed*Math.PI*2)*amplitude;
    if(spec.kind==="drop") {const phase=(t*spec.speed)%1;root.position.y=(phase<.8?phase/.8:Math.pow((1-phase)/.2,3))*amplitude;}
  });
  const yaw=(park.of(ctx).num(`${object.id}.rot`)*Math.PI)/2;
  return <group userData={{jgObjectId:object.id}} position={[object.x,groundAt(park.of(ctx),object.x,object.z),object.z]} rotation={[0,yaw,0]}><group position={spec.pivot}><group ref={ref}><primitive object={scene}/></group></group></group>;
}
const trainModel = new URL("../../../public/art/models/coaster_train.glb", import.meta.url).href;

/**
 * The train is the ride made visible. The shared path follower places it at the lap fraction the
 * ride sim's own cycle reports, so it leaves the station, runs the ring and is back at the platform
 * when the lap the track measured is over.
 */
function CoasterTrain({object,circuit}:{object:ParkObject;circuit:ReturnType<typeof coasterCircuit>}) {
  const gltf=useLoader(GLTFLoader,trainModel);
  const ref=useRef<Group>(null);
  const reduced=useGameStore(ctx=>Boolean(ctx.game.store.get("park.reduced-motion")));
  const scene=useMemo(()=>{const copy=gltf.scene.clone();copy.traverse(n=>{if(n instanceof Mesh){n.castShadow=true;n.receiveShadow=true;}});return copy;},[gltf]);
  const path=useMemo(()=>({waypoints:circuit.waypoints,speed:Math.max(1,circuit.averageSpeed),loop:true}),[circuit]);
  useFrame(()=>{
    const root=ref.current; if(!root) return;
    if(!circuit.closed||path.waypoints.length<3){root.visible=false;return;}
    root.visible=true;
    const view=rideView(object.id);
    const lap=Math.max(4,circuit.lapSeconds);
    const progress=view?.phase==="riding"&&!reduced?Math.min(1,Math.max(0,1-view.phaseSeconds/lap)):0;
    const pose=pathFollowSeek(path,{kind:"normalized",value:progress});
    root.position.set(pose.position[0],pose.position[1]+1.2,pose.position[2]);
    root.rotation.y=pose.heading;
  });
  return <group userData={{jgObjectId:object.id}}><group ref={ref}><primitive object={scene}/></group></group>;
}
function Entrance() {  const sign=useLoader(TextureLoader,new URL("../../../public/art/brightway-sign.svg",import.meta.url).href);
  return <group position={[0,0,56]}>
    {[-6,6].map(x=><group key={x}><mesh castShadow position={[x,2.3,0]}><boxGeometry args={[.65,4.6,.65]}/><meshStandardMaterial color="#247f83"/></mesh><mesh position={[x,4.85,0]}><sphereGeometry args={[.4,12,8]}/><meshStandardMaterial color="#edbc5c"/></mesh><mesh castShadow position={[x,1.2,0]}><boxGeometry args={[2,2.4,2.4]}/><meshStandardMaterial color="#ef7059"/></mesh><mesh position={[x,1.65,1.22]}><boxGeometry args={[1.4,.8,.06]}/><meshStandardMaterial color="#77b8c8"/></mesh></group>)}
    <mesh position={[0,4.2,0]}><boxGeometry args={[12,.35,.4]}/><meshStandardMaterial color="#edbc5c"/></mesh>
    <mesh position={[0,4.4,.24]}><planeGeometry args={[9,2.8]}/><meshBasicMaterial map={sign} transparent/></mesh>
    <mesh position={[0,4.4,-.24]} rotation={[0,Math.PI,0]}><planeGeometry args={[9,2.8]}/><meshBasicMaterial map={sign} transparent/></mesh>
  </group>;
}
function Fence() {
  const posts=useMemo(()=>{
    const points:[number,number][]=[];
    for(let i=-60;i<=60;i+=8){points.push([-60,i],[60,i],[i,-60]);if(Math.abs(i)>8)points.push([i,60]);}return points;
  },[]);
  return <group>
    {posts.map(([x,z],i)=><mesh key={i} castShadow position={[x,.8,z]}><boxGeometry args={[.23,1.6,.23]}/><meshStandardMaterial color="#fff1cf"/></mesh>)}
    {[.6,1.2].map(y=><group key={y}>{[-60,60].map(x=><mesh key={x} position={[x,y,0]}><boxGeometry args={[.12,.1,120]}/><meshStandardMaterial color="#ad7960"/></mesh>)}<mesh position={[0,y,-60]}><boxGeometry args={[120,.1,.12]}/><meshStandardMaterial color="#ad7960"/></mesh>{[-35,35].map(x=><mesh key={x} position={[x,y,60]}><boxGeometry args={[50,.1,.12]}/><meshStandardMaterial color="#ad7960"/></mesh>)}</group>)}
    <Entrance/>
  </group>;
}
/**
 * The blueprint's own model at the cursor, see-through and tinted: green where it can go, red where
 * it can't (the hint bar says why). It faces the way Z has turned the next build.
 */
function Ghost({kind,at,y,valid}:{kind:string;at:[number,number];y:number;valid:boolean}) {
  const config=objectModels[kind]!;
  const gltf=useLoader(GLTFLoader,config.url);
  const rotation=useGameStore(()=>session.rotation);
  const material=useMemo(()=>new MeshStandardMaterial({transparent:true,opacity:.5,depthWrite:false}),[]);
  material.color.set(valid?"#7cf3c8":"#ef7059");
  const {scene,scale,lift}=useMemo(()=>{
    const copy=gltf.scene.clone();
    copy.traverse(n=>{if(n instanceof Mesh){n.material=material;n.raycast=()=>{};n.castShadow=false;}});
    if(config.anchor!=="center") return {scene:copy,scale:1,lift:0};
    // A library model is grounded and scaled to the height the catalog asks for, like the scene does.
    const box=new Box3().setFromObject(copy),size=box.getSize(new Vector3());
    const k=config.targetHeight!==undefined&&size.y>0?config.targetHeight/size.y:1;
    return {scene:copy,scale:k,lift:-box.min.y*k};
  },[gltf,material,config]);
  return <group position={[at[0],y+lift,at[1]]} rotation={[0,rotation*Math.PI/2,0]} scale={scale}><primitive object={scene}/></group>;
}
/**
 * The lot's raised ground: one grassy block per cell above the lawn, stepped by level, with a
 * lighter top so the steps read from the park camera.
 */
function Land() {
  const ctx=useGameContext();
  useGameStore(c=>park.store.read(c));
  const cells=raisedCells(park.of(ctx));
  return <group>{cells.map(({col,row,level})=>{const [x,z]=cellCentre(col,row);const h=level*LEVEL_HEIGHT;return <group key={`${col},${row}`}>
    <mesh position={[x,h/2,z]} castShadow receiveShadow raycast={()=>{}}><boxGeometry args={[GRID,h,GRID]}/><meshStandardMaterial color={level%2===0?"#5f9a47":"#6aa851"}/></mesh>
    <mesh position={[x,h+.01,z]} rotation={[-Math.PI/2,0,0]} receiveShadow raycast={()=>{}}><planeGeometry args={[GRID,GRID]}/><meshStandardMaterial color={level%2===0?"#79b85a":"#86c565"}/></mesh>
  </group>;})}</group>;
}
function Blueprint() {
  const {gl,camera}=useThree(); const ctx=useGameContext(); const [hover,setHover]=useState<[number,number]|null>(null);
  const [down,setDown]=useState<[number,number]|null>(null);
  const selected=useGameStore(()=>session.selectedTool);
  useGameStore(c=>park.store.read(c));
  useEffect(()=>{
    const ray=new Raycaster(),plane=new Plane(new Vector3(0,1,0),0),hit=new Vector3();
    const move=(e:PointerEvent)=>{
      const r=gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
      if(!ray.ray.intersectPlane(plane,hit)){setHover(null);return;}
      const x=snapToGrid(hit.x),z=snapToGrid(hit.z);
      setHover(old=>old?.[0]===x&&old?.[1]===z?old:[x,z]);
    };
    const leave=()=>setHover(null);
    // A left press with a tool in hand starts a drag: the click that ends it lays the line or the area.
    const press=(e:PointerEvent)=>{
      if(e.button!==0||session.selectedTool===null)return;
      const r=gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
      if(!ray.ray.intersectPlane(plane,hit))return;
      const at:[number,number]=[snapToGrid(hit.x),snapToGrid(hit.z)];
      setDown(at);
      ctx.game.commands.run("build.dragFrom",{point:at});
    };
    const release=()=>setDown(null);
    gl.domElement.addEventListener("pointerdown",press);
    window.addEventListener("pointerup",release);
    const inspect=(e:PointerEvent)=>traceNative("canvas-pointer",{screen:[e.clientX,e.clientY],camera:camera.position.toArray(),quaternion:camera.quaternion.toArray(),viewport:gl.domElement.getBoundingClientRect().toJSON()});
    gl.domElement.addEventListener("pointerdown",inspect);
    gl.domElement.addEventListener("pointermove",move);gl.domElement.addEventListener("pointerleave",leave);
    return()=>{gl.domElement.removeEventListener("pointermove",move);gl.domElement.removeEventListener("pointerleave",leave);gl.domElement.removeEventListener("pointerdown",inspect);gl.domElement.removeEventListener("pointerdown",press);window.removeEventListener("pointerup",release);};
  },[gl,camera,ctx]);
  const def=selected?BUILDABLES[selected]??null:null;
  const check=def&&hover?placementAt(park.of(ctx),def.id,...hover):null;
  const landRefusal=isLandTool(selected)&&hover?landCheck(ctx,selected,...hover):null;
  const refusal=isLandTool(selected)?landRefusal:check===null?null:hoverRefusal(check);
  useEffect(()=>{if(placementHintStore.read(ctx)!==refusal)placementHintStore.write(ctx,refusal);return()=>{if(placementHintStore.read(ctx)!==null)placementHintStore.write(ctx,null);};},[ctx,refusal]);
  if(isLandTool(selected)&&hover){
    const color=landRefusal===null?(selected==="land_raise"?"#7cf3c8":"#f3c87c"):"#ef7059";
    const cells=rectCells(cellAt(...(down??hover)),cellAt(...hover));
    return <group>{cells.map(([col,row])=>{const [x,z]=cellCentre(col,row);const y=groundAt(park.of(ctx),x,z);return <mesh key={`${col},${row}`} position={[x,y+.25,z]} rotation={[-Math.PI/2,0,0]} raycast={()=>{}}><planeGeometry args={[GRID-.2,GRID-.2]}/><meshBasicMaterial color={color} transparent opacity={.45} depthWrite={false}/></mesh>;})}</group>;
  }
  if(!def||!hover)return null;
  const valid=refusal===null;
  const color=valid?"#7cf3c8":"#ef7059";
  const w=park.of(ctx);
  // Dragging a path or queue shows the whole line it will lay.
  const dragging=down!==null&&LINE_KINDS.has(def.id)&&cellAt(...down).join()!==cellAt(...hover).join();
  const centres=dragging?lineCells(cellAt(...down),cellAt(...hover)).map(([c,r])=>cellCentre(c,r)):cellCentres(def.id,cellFor(def.id,...hover));
  const mid=centres.reduce((a,[x,z])=>[a[0]+x/centres.length,a[1]+z/centres.length],[0,0]);
  const lineColor=(x:number,z:number)=>dragging?(placementAt(w,def.id,x,z).ok?"#7cf3c8":"#ef7059"):color;
  return <group>{!dragging&&<Suspense fallback={null}><Ghost kind={def.id} at={mid as [number,number]} y={groundAt(w,mid[0]!,mid[1]!)} valid={valid}/></Suspense>}{def.staff&&<PatrolRing x={mid[0]!} z={mid[1]!} radius={def.staff.patrol}/>}{centres.map(([x,z])=>{const key=`${x},${z}`;return <mesh key={key} position={[x,groundAt(w,x,z)+.22,z]} rotation={[-Math.PI/2,0,0]} raycast={()=>{}}><planeGeometry args={[GRID-.12,GRID-.12]}/><meshBasicMaterial color={lineColor(x,z)} transparent opacity={.4} depthWrite={false}/></mesh>;})}</group>;
}
/** A staff post's patrol area on the ground: where its person walks and does its job. */
function PatrolRing({x,z,radius}:{x:number;z:number;radius:number}) {
  return <group position={[x,.25,z]} rotation={[-Math.PI/2,0,0]}>
    <mesh raycast={()=>{}}><circleGeometry args={[radius,64]}/><meshBasicMaterial color="#5fb8ff" transparent opacity={.12} depthWrite={false}/></mesh>
    <mesh raycast={()=>{}}><ringGeometry args={[radius-.25,radius,64]}/><meshBasicMaterial color="#5fb8ff" transparent opacity={.8} depthWrite={false}/></mesh>
  </group>;
}
export function BrightwayParkWorldOverlay() {
  return (
    <>
      <SceneCaptureBinding bind={bindParkCapture} />
      <OverlayBodies />
    </>
  );
}

function OverlayBodies() {
  const ctx=useGameContext();
  const selection=useGameStore(()=>session.selectedObject);
  const objects=useGameStore(c=>parkObjects(c));
  const circuit=useMemo(()=>coasterCircuit(ctx),[ctx,objects]);
  const obj=parkObject(ctx,selection);
  return <group><Fence/><Land/><Blueprint/>
    {objects.filter(o=>MOTION[o.kind]).map(o=><Suspense key={o.id} fallback={null}><RideMotion object={o}/></Suspense>)}
    {objects.filter(o=>o.kind==="ride_coaster").map(o=><CoasterTrain key={o.id} object={o} circuit={circuit}/>)}
    {obj?.def.staff&&<PatrolRing x={obj.x} z={obj.z} radius={patrolRadius(park.of(ctx),obj.id)}/>}
    {obj&&<mesh position={[obj.x,.23,obj.z]} rotation={[-Math.PI/2,0,0]} raycast={()=>{}}><ringGeometry args={[Math.max(2,obj.def.footprint*.65),Math.max(2,obj.def.footprint*.65)+.18,48]}/><meshBasicMaterial color="#edbc5c"/></mesh>}
  </group>;
}


