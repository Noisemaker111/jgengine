"""Decode shipped GLBs with Blender and optionally render into scratch evidence.

DEEPWARD_ASSET_EVIDENCE=/absolute/scratch/path blender -b -t 4 -P this_file
This checks decoded images, mesh UVs, and measured bounds against the manifest.
Game integration and visual acceptance still require the native game renderer.
"""
import bpy,os,json,hashlib,math
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR=os.path.join(ROOT,'public/models/imported/deepward')
if os.environ.get('DEEPWARD_ASSET_SET'):DIR=os.path.join(DIR,os.environ['DEEPWARD_ASSET_SET'])
manifest=json.load(open(os.path.join(DIR,'asset-manifest.json')))
evidence=os.environ.get('DEEPWARD_ASSET_EVIDENCE')
only=os.environ.get('DEEPWARD_ASSET_ONLY','').split(',')
for item in manifest['models']:
    if only!=[''] and item['file'][:-4] not in only:continue
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    path=os.path.join(DIR,item['file']);assert hashlib.sha256(open(path,'rb').read()).hexdigest()==item['sha256']
    bpy.ops.import_scene.gltf(filepath=path)
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials]
    print('DEEPWARD_IMPORTED_MESHES',len(meshes),item.get('staticDrawCalls',item.get('primitives')),flush=True)
    assert sum(len(o.data.materials) for o in meshes)==item.get('staticDrawCalls',item.get('primitives'))
    coords=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
    lo=Vector(tuple(min(v[i] for v in coords) for i in range(3)));hi=Vector(tuple(max(v[i] for v in coords) for i in range(3)))
    actual=[hi.x-lo.x,hi.z-lo.z,hi.y-lo.y]
    assert all(abs(a-b)<.002 for a,b in zip(actual,item['dims'])),(item['file'],actual,item['dims'])
    assert abs(lo.z-item.get('minY',item['bounds']['min'][1]))<.002
    for o in meshes:assert o.data.uv_layers and all(len(p.vertices)==3 for p in o.data.polygons)
    for mat in {m for o in meshes for m in o.data.materials}:
        for n in mat.node_tree.nodes:
            if n.type=='TEX_IMAGE':
                assert n.image and n.image.size[0]>0 and n.image.size[1]>0
                assert max(n.image.size)<=256
    rigs=[o for o in bpy.context.scene.objects if o.type=='ARMATURE']
    if rigs:
        rig=rigs[0];actions={clip:next(a for a in bpy.data.actions if a.name.startswith(clip+'_')) for clip in item['clips']}
        for clip,action in actions.items():
            rig.animation_data.action=action;duration=action.frame_range.y
            lowest=0;poses=[]
            for frac in [0,.25,.5,.75,1]:
                bpy.context.scene.frame_set(int(duration*frac),subframe=(duration*frac)%1)
                dep=bpy.context.evaluated_depsgraph_get()
                z=min((o.evaluated_get(dep).matrix_world@v.co).z for o in meshes for v in o.evaluated_get(dep).data.vertices)
                lowest=min(lowest,z)
                poses.append((rig.pose.bones['hand_R'].head.copy(),rig.pose.bones['foot_R'].head.copy()))
            assert lowest>-.006,(clip,'feet intersect the floor',lowest)
            travel=max((p[0]-poses[0][0]).length+(p[1]-poses[0][1]).length for p in poses)
            assert travel>.002,(clip,'animation has no visible joint motion')
            print('DEEPWARD_POSE_PASS',clip,'joint travel',round(travel,4),'lowest',round(lowest,5),flush=True)
        requested=os.environ.get('DEEPWARD_ASSET_CLIP','idle');rig.animation_data.action=actions[requested]
        seconds=float(os.environ.get('DEEPWARD_ASSET_TIME','0'));frame=seconds*bpy.context.scene.render.fps
        bpy.context.scene.frame_set(int(frame),subframe=frame%1)
    print('DEEPWARD_DECODE_PASS',item['file'],[round(v,4) for v in actual],flush=True)
    if not evidence:continue
    os.makedirs(evidence,exist_ok=True)
    sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=24;sc.cycles.use_denoising=False
    sc.render.resolution_x=1000;sc.render.resolution_y=800;sc.render.resolution_percentage=100
    sc.world.color=(.16,.16,.16)
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,lo.z-.02));ground=bpy.context.object
    mat=bpy.data.materials.new('Inspection floor');mat.diffuse_color=(.07,.08,.08,1);ground.data.materials.append(mat)
    center=(lo+hi)*.5;size=max(hi-lo)
    for p,power,scale in [((size*1.7,-size*1.8,size*2.8),1000*size,5),((-size*1.5,-size*.5,size*1.8),500*size,4),((size*.2,size*2,size*2.1),1000*size,3)]:
        bpy.ops.object.light_add(type='AREA',location=p);l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=scale
        l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(size*1.4,-size*1.75,size*1.2))
    c=bpy.context.object;c.rotation_euler=(center-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=size*1.9;sc.camera=c
    suffix='-decoded'
    if rigs and os.environ.get('DEEPWARD_ASSET_CLIP'):suffix+='-'+os.environ['DEEPWARD_ASSET_CLIP']+'-'+os.environ.get('DEEPWARD_ASSET_TIME','0')
    sc.render.filepath=os.path.join(evidence,item['file'][:-4]+suffix+'.png');bpy.ops.render.render(write_still=True)
