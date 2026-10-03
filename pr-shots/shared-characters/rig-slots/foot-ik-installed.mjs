import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const consumer='/workspace/JGengine/.scratch/characters/consumer/rig-slots';
const requireConsumer=createRequire(`${consumer}/package.json`);
const manifest=JSON.parse(readFileSync(`${consumer}/candidate-package-manifest.json`,'utf8'));
assert.equal(manifest.commit,'4955a4444167b22650e929f807a7d4572375d261');
for(const pkg of manifest.packages)assert.equal(createHash('sha256').update(readFileSync(pkg.path)).digest('hex'),pkg.sha256);
const exports=['@jgengine/shell/render/useFootIk','@jgengine/shell/render/rigNode'].map(name=>{
 const path=realpathSync(requireConsumer.resolve(name));
 assert.ok(path.startsWith(`${consumer}/node_modules/`)&&path.includes('/dist/'),`not installed consumer export: ${path}`);
 return{name,path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')};
});
const threeModule=realpathSync(requireConsumer.resolve('three')).replace(/three\.cjs$/,'three.module.js');
const shellThree=realpathSync(createRequire(exports[0].path).resolve('three')).replace(/three\.cjs$/,'three.module.js');
assert.equal(threeModule,shellThree,'rig objects use the installed shell peer Three.js identity');
const THREE=await import(pathToFileURL(threeModule));
const {GLTFLoader}=await import(pathToFileURL(requireConsumer.resolve('three/examples/jsm/loaders/GLTFLoader.js')));
const {MeshoptDecoder}=await import(pathToFileURL(requireConsumer.resolve('three/examples/jsm/libs/meshopt_decoder.module.js')));
const {clone}=await import(pathToFileURL(requireConsumer.resolve('three/examples/jsm/utils/SkeletonUtils.js')));
const {resolveFootIkRig,applyFootIk}=await import(pathToFileURL(exports[0].path));
const {resolveRigNode}=await import(pathToFileURL(exports[1].path));
const cases=[];
const assets=[
 {name:'Knight',path:`${consumer}/games/scrap-signal/public/models/kaykit-adventurers/Knight.glb`,consumer:'Scrap Signal gauge NPC'},
 {name:'Rogue',path:'/workspace/JGengine/apps/dev/public/models/kaykit-adventurers/Rogue.glb',consumer:'existing SDK imported-rig fixture'},
 {name:'Rogue_Hooded',path:`${consumer}/games/scrap-signal/public/models/kaykit-adventurers/Rogue_Hooded.glb`,consumer:'Scrap Signal reactor_hunter player'},
];
const oldWarn=console.warn,oldError=console.error;const warnings=[],errors=[];
console.warn=(...args)=>warnings.push(args.map(String).join(' '));console.error=(...args)=>errors.push(args.map(String).join(' '));
try{
 for(const asset of assets){
  const bytes=readFileSync(asset.path);const caseWarningsStart=warnings.length,caseErrorsStart=errors.length;
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // Numerical rig proof: preserve original nodes/skins/animations; skip only material texture decode.
  // The source bytes are unmodified and hashed. This is not an image/material/native visual claim.
  loader.register(parser=>({name:'numerical-rig-proof-no-image-decode',beforeRoot(){
   for(const material of parser.json.materials??[]){delete material.normalTexture;delete material.occlusionTexture;delete material.emissiveTexture;
    if(material.pbrMetallicRoughness){delete material.pbrMetallicRoughness.baseColorTexture;delete material.pbrMetallicRoughness.metallicRoughnessTexture;}
   }
  }}));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const scenes=[clone(gltf.scene),clone(gltf.scene)];
  const originals=gltf.scene.children.map(child=>child.uuid);
  const authoredFeet=['l','r'].map(side=>({root:`upperleg.${side}`,mid:`lowerleg.${side}`,tip:`foot.${side}`}));
  const runtimeFeet=['l','r'].map(side=>({root:`upperleg${side}`,mid:`lowerleg${side}`,tip:`foot${side}`}));
  const referenceMappings=authoredFeet.map((chain,index)=>Object.fromEntries(Object.entries(chain).map(([role,name])=>{
   const authored=resolveRigNode(scenes[0],name),runtime=resolveRigNode(scenes[0],runtimeFeet[index][role]);
   assert.ok(authored.node&&runtime.node);assert.equal(authored.node,runtime.node);assert.equal(authored.matchedBy,'authored');assert.equal(runtime.matchedBy,'runtime');
   return[role,{authored:name,runtime:authored.node.name,authoredMatch:authored.matchedBy,runtimeMatch:runtime.matchedBy}];
  })));
  const rigs=scenes.map((scene,index)=>resolveFootIkRig(scene,{feet:index===0?authoredFeet:runtimeFeet}));
  assert.ok(rigs.every(rig=>rig&&rig.legs.length===2));
  const clip=THREE.AnimationClip.findByName(gltf.animations,'Walking_A');assert.ok(clip);
  const mixers=scenes.map(scene=>{const mixer=new THREE.AnimationMixer(scene);mixer.clipAction(clip).play();return mixer;});
  const states=[{weight:1,pelvis:0},{weight:1,pelvis:0}];
  const probe=({origin,maxDistance})=>{const y=origin[2]*.2,distance=origin[1]-y;return distance<0||distance>maxDistance?null:{point:[origin[0],y,origin[2]],normal:[0,1/Math.sqrt(1.04),-.2/Math.sqrt(1.04)]};};
  let maxPositionError=0,maxQuaternionError=0;
  for(let frame=0;frame<60;frame++){
   for(let index=0;index<2;index++){mixers[index].update(1/60);scenes[index].updateMatrixWorld(true);applyFootIk(rigs[index],0,probe,states[index],1/60);}
   for(const{bone}of rigs[0].poses){
    const other=scenes[1].getObjectByName(bone.name);assert.ok(other);
    const position=bone.getWorldPosition(new THREE.Vector3()),otherPosition=other.getWorldPosition(new THREE.Vector3());
    assert.ok(position.toArray().every(Number.isFinite)&&bone.quaternion.toArray().every(Number.isFinite));
    maxPositionError=Math.max(maxPositionError,position.distanceTo(otherPosition));
    maxQuaternionError=Math.max(maxQuaternionError,...bone.quaternion.toArray().map((value,index)=>Math.abs(value-other.quaternion.toArray()[index])));
   }
  }
  assert.ok(maxPositionError<=1e-12&&maxQuaternionError<=1e-12);
  assert.deepEqual(gltf.scene.children.map(child=>child.uuid),originals);
  for(let index=0;index<2;index++){mixers[index].stopAllAction();mixers[index].uncacheRoot(scenes[index]);}
  const caseWarnings=warnings.slice(caseWarningsStart),caseErrors=errors.slice(caseErrorsStart);assert.equal(caseWarnings.length,0);assert.equal(caseErrors.length,0);
  cases.push({...asset,sha256:createHash('sha256').update(bytes).digest('hex'),clips:gltf.animations.length,referenceMappings,resolved:rigs[0].legs.map(leg=>[leg.root.name,leg.mid.name,leg.tip.name]),frames:60,slopeHeight:'y=z*0.2',maxPositionError,maxQuaternionError,warnings:caseWarnings,errors:caseErrors});
 }
}finally{console.warn=oldWarn;console.error=oldError;}
const result={label:'unreleased installed public package numerical foot-IK proof; no native foot appearance or retargeting claim',cohort:manifest.commit,tree:manifest.tree,shellTarball:manifest.packages.find(pkg=>pkg.name==='@jgengine/shell'),exports,threeModule,importedImageDecodeSkipped:true,sourceBytesUnmodified:true,framesPerCase:60,warnings,errors,cases};
writeFileSync('/workspace/JGengine/.scratch/characters/ik/authored-leg-installed-4955a444.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
