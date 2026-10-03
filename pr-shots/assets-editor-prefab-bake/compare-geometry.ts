import {Matrix4,Matrix3,Vector3,Quaternion} from "three";
import {strict as assert}from"node:assert";
export function compareGeometry(left:Uint8Array,right:Uint8Array){
 function read(bytes:Uint8Array){
  const b=Buffer.from(bytes);const doc=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());const base=28+b.readUInt32LE(12);const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
  const components:any={5120:[1,"getInt8"],5121:[1,"getUint8"],5122:[2,"getInt16"],5123:[2,"getUint16"],5125:[4,"getUint32"],5126:[4,"getFloat32"]};const widths:any={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
  const attribute=(id:number)=>{const a=doc.accessors[id];assert.ok(!a.sparse);const v=doc.bufferViews[a.bufferView];const [size,method]=components[a.componentType];return Array.from({length:a.count},(_,i)=>Array.from({length:widths[a.type]},(_,j)=>(view as any)[method](base+(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??size*widths[a.type])+j*size,true)));};
  function material(v:any):any{if(!v||typeof v!=="object")return v;if(Array.isArray(v))return v.map(material);return Object.fromEntries(Object.keys(v).sort().filter(k=>!["name","extras"].includes(k)).map(k=>[k,k==="index"?doc.images[doc.textures[v[k]].source].uri:material(v[k])]));}
  const groups=new Map<string,number[][]>();
  function walk(id:number,parent:Matrix4){const n=doc.nodes[id];const local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));const world=parent.clone().multiply(local);const normalMatrix=new Matrix3().getNormalMatrix(world);
   for(const p of n.mesh===undefined?[]:doc.meshes[n.mesh].primitives){const attrs:any=Object.fromEntries(Object.keys(p.attributes).sort().map(k=>[k,attribute(p.attributes[k])]));for(const v of attrs.POSITION)new Vector3(...v).applyMatrix4(world).toArray(v);for(const v of attrs.NORMAL??[])new Vector3(...v).applyMatrix3(normalMatrix).normalize().toArray(v);
    const index=p.indices===undefined?attrs.POSITION.map((_:any,i:number)=>[i]):attribute(p.indices);const m=JSON.stringify(material(doc.materials[p.material]));
    for(let i=0;i<index.length;i+=3){const vertices=[0,1,2].map(c=>Object.keys(attrs).map(k=>attrs[k][index[i+c][0]]).flat());const keys=vertices.map(v=>JSON.stringify(v.map((x:number)=>Math.round(x*1e3)/1e3)));const rotations=keys.map((_,j)=>[...keys.slice(j),...keys.slice(0,j)].join("|"));const rotated=rotations.indexOf([...rotations].sort()[0]);const ordered=[...vertices.slice(rotated),...vertices.slice(0,rotated)].flat();const key=m+"|"+rotations[rotated];const list=groups.get(key)??[];list.push(ordered);groups.set(key,list);}
   }for(const child of n.children??[])walk(child,world);
  }
  for(const root of doc.scenes[doc.scene??0].nodes)walk(root,new Matrix4());return groups;
 }
 const a=read(left),b=read(right);let maxDelta=0,triangles=0;const unmatched:{material:string,row:number[]}[]=[];
 const delta=(left:number[],right:number[])=>{if(left.length!==right.length)return Infinity;let best=Infinity;const stride=left.length/3;for(let turn=0;turn<3;turn++){let d=0;for(let j=0;j<left.length;j++)d=Math.max(d,Math.abs(left[j]-right[(j+turn*stride)%right.length]));best=Math.min(best,d);}return best;};
 for(const [key,rows]of a)for(const row of rows){const candidates=b.get(key)??[];const index=candidates.findIndex(other=>delta(row,other)<=1e-4);if(index>=0){maxDelta=Math.max(maxDelta,delta(row,candidates[index]));candidates.splice(index,1);}else unmatched.push({material:key.split("|",1)[0],row});triangles++;}
 const remaining=new Map<string,number[][]>();for(const [key,rows]of b){const material=key.split("|",1)[0];remaining.set(material,[...(remaining.get(material)??[]),...rows]);}
 for(const {material,row}of unmatched){const candidates=remaining.get(material)??[];let best=Infinity,index=-1;for(let i=0;i<candidates.length;i++){const d=delta(row,candidates[i]);if(d<best){best=d;index=i;}}assert.ok(best<=1e-4,`attributed world triangle delta ${best} >1e-4`);maxDelta=Math.max(maxDelta,best);candidates.splice(index,1);}
 assert.equal([...remaining.values()].reduce((n,rows)=>n+rows.length,0),0,"unmatched candidate triangles");return{maxDelta,triangles,tolerance:1e-4};
}
