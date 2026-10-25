"""Original rigged Deepward Fitter and service weapons, Blender 4.3+.

Character: floor origin, +Z glTF facing, 1.87m height, idle/walk/windup clips.
Weapons: grip origin, -Z glTF firing direction; sidearm -.22m, rifle -.5m muzzle.
All dimensions are asset-local. World and hand placement stay in the editor/runtime.
"""
import bpy,os,json,math,hashlib,struct,importlib.util,sys
sys.dont_write_bytecode=True
from mathutils import Vector,Matrix
spec=importlib.util.spec_from_file_location('dw_art',os.path.join(os.path.dirname(__file__),'build-original-machinery.py'))
A=importlib.util.module_from_spec(spec);spec.loader.exec_module(A)
OUT=os.path.join(A.OUT,'fitter');os.makedirs(OUT,exist_ok=True)
A.material('Fitter printed skin',(.15,.095,.057),.04,.58)
A.material('Workcoat textile',(.028,.055,.045),0,.83)
A.material('Amber visor',(.24,.14,.035),.72,.21)
def cloth_map():
    n=256;rng=A.np.random.default_rng(4104);y,x=A.np.mgrid[:n,:n]
    weave=((x%4==0)|(y%4==0)).astype(float)*.11
    grain=rng.random((n,n))*.08
    base=A.np.array([.14,.22,.19])[None,None,:]*(.94-weave[:,:,None]+grain[:,:,None])
    rgba=A.np.concatenate((base,A.np.ones((n,n,1))),-1)
    im=bpy.data.images.new('Original Fitter workcoat woven cotton',width=n,height=n,alpha=True)
    im.pixels.foreach_set(rgba.astype(A.np.float32).ravel());im.pack()
    mat=A.M['Workcoat textile'];node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=im
    mat.node_tree.links.new(node.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
cloth_map()
parts=[]
def bonepart(o,bone):
    g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');parts.append(o);return o
def box(n,p,d,mat,bone,bevel=.012):return bonepart(A.box(n,p,d,mat,bevel),bone)
def cyl(n,p,r,h,mat,bone,axis='Z',vertices=20):return bonepart(A.cyl(n,p,r,h,mat,axis,vertices,.004),bone)
def tube(n,pts,r,mat,bone):return bonepart(A.tube(n,pts,r,mat),bone)
def ellipsoid(n,p,s,mat,bone,segments=20,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=p)
    o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return bonepart(A.finish(o,mat,0,True),bone)
def marking(t,p,size,mat,bone):return bonepart(A.text(t,p,size,mat),bone)
def seam(p,q,bone,r=.003):return tube('Stitched coat seam',[p,q],r,'Aged ivory enamel',bone)
def limb(n,p,q,r0,r1,mat,bone):
    # Elliptical sleeve/leg section with hem rings, not a renderer capsule.
    p,q=Vector(p),Vector(q);axis=(q-p).normalized();u=axis.cross(Vector((0,1,0))).normalized();v=axis.cross(u)
    points=[];steps=6;sides=20
    for j in range(steps):
        t=j/(steps-1);radius=r0*(1-t)+r1*t;center=p.lerp(q,t)
        # Cloth has an authored hem compression and shallow fold envelope.
        radius*=1+.035*math.sin(t*math.pi*5)
        for i in range(sides):
            a=i*math.tau/sides;points.append(tuple(center+u*math.cos(a)*radius+v*math.sin(a)*radius*.85))
    faces=[tuple(reversed(range(sides))),tuple(range((steps-1)*sides,steps*sides))]
    for j in range(steps-1):
        for i in range(sides):faces.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
    mesh=bpy.data.meshes.new(n);mesh.from_pydata(points,[],faces);mesh.update()
    o=bpy.data.objects.new(n,mesh);bpy.context.collection.objects.link(o);return bonepart(A.finish(o,mat,0,True),bone)

def weapon(rifle=False,bone=None):
    # Blender +Y firing direction becomes glTF -Z. Grip centre is exactly origin.
    own=[]
    def b(n,p,d,mat='Petrol enamel',bevel=.006):
        o=A.box(n,p,d,mat,bevel);own.append(o);return o
    def c(n,p,r,h,mat='Machined steel',axis='Y',nverts=20):
        o=A.cyl(n,p,r,h,mat,axis,nverts,.002);own.append(o);return o
    def t(n,points,r=.006,mat='Copper ink plumbing'):
        o=A.tube(n,points,r,mat);own.append(o);return o
    w=.103 if rifle else .094
    b('Service receiver',(0,.045,.038),(w,.22 if rifle else .17,.092),'Petrol enamel')
    b('Receiver top spine',(0,.035,.09),(w*.67,.2 if rifle else .17,.023),'Machined steel',.003)
    b('Pistol grip',(0,-.013,-.07),(.072,.07,.145),'Black rubber and ink',.012)
    for z in [-.12,-.103,-.086,-.069,-.052]:b('Grip moulded ridges',(0,-.049,z),(.064,.006,.006),'Cast graphite iron',.001)
    t('Trigger guard',[(-.034,.028,-.03),(-.034,.08,-.03),(-.034,.08,-.067),(-.034,.02,-.085)],.005,'Machined steel')
    t('Trigger shoe',[(0,.04,-.025),(0,.051,-.048),(0,.042,-.059)],.006,'Cast graphite iron')
    muzzle=.5 if rifle else .22
    c('Service rifled barrel',(0,.17 if not rifle else .32,.043),.023,.10 if not rifle else .33)
    # Open muzzle wall with recessed dark bore, anchored to exact runtime muzzle Z.
    c('Muzzle ferrule',(0,muzzle-.016,.043),.031,.032,'Cast graphite iron')
    c('Dark recessed bore',(0,muzzle+.0002,.043),.014,.001,'Black rubber and ink')
    b('Muzzle post',(0,muzzle-.038,.083),(.012,.013,.038),'Warning ochre',.002)
    b('Rear aiming notch',(0,-.023,.106),(.038,.018,.026),'Cast graphite iron',.002)
    b('Ejection port',(.053,.04,.049),(.003,.064,.026),'Black rubber and ink',.001)
    b('Port recessed bolt',(.055,.04,.049),(.004,.037,.016),'Machined steel',.001)
    for y in [-.025,.06,.12]:
        for x in [-1,1]:c('Receiver screw',(x*(w/2+.002),y,.056),.006,.004,'Machined steel','X',6)
    b('Receiver maker plate',(-w/2-.003,.048,.056),(.006,.085,.03),'Aged ivory enamel',.002)
    c('Pressure charge pod',(-.029,.055,-.029),.012,.095,'Copper ink plumbing')
    t('Charge supply line',[(-.047,-.035,-.025),(-.06,-.035,.013),(-.06,.12,.013)],.004)
    if rifle:
        b('Skeleton stock spine',(0,-.195,.034),(.051,.25,.045),'Cast graphite iron')
        b('Stock cheek rest',(0,-.175,.067),(.074,.15,.048),'Aged ivory enamel')
        b('Stock buttplate',(0,-.356,.017),(.087,.027,.127),'Black rubber and ink',.008)
        t('Open stock lower strut',[(0,-.071,-.004),(0,-.338,-.033),(0,-.338,.046)],.013,'Machined steel')
        b('Vented barrel shroud',(0,.241,.043),(.091,.177,.081),'Aged ivory enamel')
        for y in [.186,.213,.24,.267,.294]:
            for x in [-1,1]:b('Shroud punched cooling slot',(x*.047,y,.057),(.004,.015,.028),'Cast graphite iron',.002)
        b('Box magazine',(0,.084,-.091),(.053,.072,.151),'Cast graphite iron')
        for x in [-1,1]:
            for z in [-.14,-.115,-.09]:b('Magazine pressed rib',(x*.029,.084,z),(.005,.058,.008),'Machined steel',.001)
        c('Underbarrel gas tube',(0,.267,-.016),.011,.26,'Copper ink plumbing')
    else:
        b('Sidearm slide',(0,.055,.077),(.099,.181,.035),'Aged ivory enamel')
        for y in [-.017,-.009,-.001,.007]:
            for x in [-1,1]:b('Slide grip serration',(x*.051,y,.076),(.004,.003,.027),'Cast graphite iron',.001)
        b('Magazine base',(0,-.014,-.15),(.079,.074,.014),'Warning ochre',.003)
        b('Sidearm heel',(0,-.123,.034),(.084,.048,.065),'Petrol enamel')
        b('Rear receiver bridge',(0,-.06,.034),(.068,.105,.05),'Cast graphite iron')
    # Runtime muzzle anchors sit at Y=0 in glTF, so align the bore to that plane.
    for o in own:o.location.z-=.043
    # Bone attachment changes only local geometry, never gameplay muzzle authority.
    if bone:
        for o in own:bonepart(o,bone)
    return own

def fitter():
    global parts;parts=[]
    # Protective knee-length workcoat with shaped waist/shoulders and split skirts.
    limb('Shaped upper workcoat',(0,0,.95),(0,0,1.43),.275,.315,'Workcoat textile','chest')
    ellipsoid('Tailored shoulder yoke',(0,.008,1.39),(.332,.145,.113),'Workcoat textile','chest')
    for x in [-.145,.145]:
        box('Split coat skirt',(x,-.008,.875),(.274,.294,.3),'Workcoat textile','pelvis',.034)
        seam((x-.11,-.158,.98),(x-.11,-.158,.743),'pelvis')
    box('Coat central placket',(0,-.255,1.155),(.031,.028,.44),'Petrol enamel','chest',.008)
    for z in [1.015,1.105,1.195,1.285,1.375]:cyl('Coat brass stud',(0,-.275,z),.009,.008,'Copper ink plumbing','chest','Y',12)
    # Shoulder pivots retain the established ±.36m,1.3m contract.
    for side,label in [(-1,'L'),(1,'R')]:
        x=side*.36
        ellipsoid('Sleeve shoulder',(x,0,1.29),(.106,.098,.124),'Workcoat textile','upper_arm_'+label)
        limb('Upper sleeve',(x,0,1.3),(x,0,1.025),.098,.078,'Workcoat textile','upper_arm_'+label)
        limb('Folded forearm sleeve',(x,0,1.01),(x,-.07,.775),.079,.06,'Workcoat textile','forearm_'+label)
        ellipsoid('Rounded elbow patch',(x,.057,1.025),(.083,.035,.066),'Petrol enamel','forearm_'+label)
        cyl('Leather glove cuff',(x,-.07,.795),.063,.054,'Aged ivory enamel','hand_'+label)
        ellipsoid('Gauntlet palm',(x,-.075,.74),(.061,.058,.079),'Black rubber and ink','hand_'+label)
        for dx in [-.036,-.012,.012,.036]:ellipsoid('Individual glove finger',(x+dx,-.12,.727),(.009,.019,.042),'Cast graphite iron','hand_'+label,12,8)
        ellipsoid('Gloved thumb',(x-side*.053,-.09,.759),(.015,.028,.026),'Black rubber and ink','hand_'+label,12,8)
        box('Shoulder warning epaulette',(x,-.03,1.363),(.151,.125,.053),'Warning ochre','upper_arm_'+label,.016)
        # Trousers, knee pads, creased boots and separate soles.
        hip=side*.14
        limb('Work trouser upper leg',(hip,0,.98),(hip,0,.545),.103,.081,'Workcoat textile','thigh_'+label)
        limb('Work trouser shin',(hip,0,.53),(hip,-.012,.17),.077,.065,'Workcoat textile','shin_'+label)
        ellipsoid('Kneepad',(hip,-.078,.55),(.076,.039,.072),'Petrol enamel','shin_'+label)
        box('Boot sole',(hip,-.064,.023),(.174,.331,.046),'Black rubber and ink','foot_'+label,.015)
        ellipsoid('Rounded safety boot',(hip,-.065,.105),(.085,.164,.085),'Cast graphite iron','foot_'+label)
        box('Steel toe cap',(hip,-.194,.076),(.16,.096,.067),'Machined steel','foot_'+label,.025)
        for z in [.14,.158,.176]:tube('Boot lace',[(hip-.042,-.078,z),(hip+.042,-.078,z)],.004,'Aged ivory enamel','foot_'+label)
        for j in [-1,1]:box('Belt salvage pouch',(side*.215,-.23 if j<0 else .23,1.019),(.12,.097,.165),'Petrol enamel','pelvis',.019)
        box('Pouch clasp',(side*.215,-.285,1.03),(.037,.01,.041),'Copper ink plumbing','pelvis',.003)
    cyl('Neck pressure seal',(0,0,1.5),.095,.15,'Black rubber and ink','neck')
    ellipsoid('Printed operator head',(0,-.01,1.655),(.128,.112,.171),'Fitter printed skin','head')
    ellipsoid('Safety helmet crown',(0,.011,1.815),(.153,.145,.055),'Petrol enamel','head')
    box('Helmet front brim',(0,-.143,1.771),(.312,.073,.025),'Aged ivory enamel','head',.016)
    box('Goggle brow frame',(0,-.114,1.699),(.272,.026,.09),'Cast graphite iron','head',.02)
    for x in [-.064,.064]:
        ellipsoid('Amber safety goggle lens',(x,-.143,1.698),(.059,.017,.039),'Amber visor','head')
        cyl('Helmet ear protection',(x/abs(x)*.147,.012,1.704),.054,.035,'Aged ivory enamel','head','X')
        cyl('Earcup clamp',(x/abs(x)*.17,.012,1.704),.019,.008,'Copper ink plumbing','head','X',12)
    ellipsoid('Respirator cup',(0,-.121,1.612),(.078,.052,.05),'Petrol enamel','head')
    for x in [-.066,.066]:cyl('Respirator charcoal filter',(x,-.166,1.613),.024,.044,'Cast graphite iron','head','Y',16)
    tube('Helmet rear strap',[(-.129,.05,1.733),(-.08,.12,1.733),(.08,.12,1.733),(.129,.05,1.733)],.009,'Black rubber and ink','head')
    marking('DW',(0,-.143,1.805),.04,'Paper and gauge face','head')
    box('Fitter chest label',(-.148,-.253,1.303),(.107,.027,.067),'Aged ivory enamel','chest',.007)
    marking('F/04',(-.148,-.27,1.303),.029,'Cast graphite iron','chest')
    for x in [-.165,.165]:
        tube('Load harness',[(x,-.226,1.02),(x,-.267,1.27),(x,-.12,1.453),(x,.13,1.44),(x,.265,1.02)],.022,'Black rubber and ink','chest')
        box('Harness brass adjuster',(x,-.273,1.161),(.065,.017,.068),'Copper ink plumbing','chest',.005)
    box('Back recovery pack',(0,.206,1.222),(.285,.188,.31),'Petrol enamel','chest',.028)
    cyl('Pack air cartridge',(.158,.209,1.218),.06,.32,'Copper ink plumbing','chest')
    tube('Respirator supply',[(-.076,.166,1.456),(-.164,.139,1.403),(-.184,.256,1.208)],.017,'Black rubber and ink','chest')
    # Recognizable open-ended maintenance spanner carried in the left gauntlet.
    box('Spanner shank',(-.36,-.13,.723),(.033,.028,.26),'Machined steel','hand_L',.007)
    for x in [-.391,-.329]:box('Open spanner jaw',(x,-.13,.565),(.023,.044,.095),'Machined steel','hand_L',.007)
    box('Spanner jaw neck',(-.36,-.13,.597),(.082,.044,.023),'Machined steel','hand_L',.005)
    guns=weapon(True)
    carry=Matrix.Translation((.36,-.08,.75))@Matrix.Rotation(-math.pi/2,4,'X')
    bpy.ops.object.select_all(action='DESELECT')
    for o in guns:
        # Shoulder-down carry: rifle forward axis points down, butt above grip.
        o.matrix_world=carry@o.matrix_world
        # Apply one affine transform to mesh in world coordinates for consistent carry.
        bpy.context.view_layer.objects.active=o;o.select_set(True)
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True);o.select_set(False)
        bonepart(o,'hand_R')

def create_rig():
    arm=bpy.data.armatures.new('Deepward fitter skeleton');rig=bpy.data.objects.new('Deepward Fitter',arm);bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    defs=[('root',(0,0,0),(0,0,.4),None),('pelvis',(0,0,.95),(0,0,1.12),'root'),('chest',(0,0,1.12),(0,0,1.44),'pelvis'),('neck',(0,0,1.44),(0,0,1.56),'chest'),('head',(0,0,1.56),(0,0,1.83),'neck')]
    for side,label in [(-1,'L'),(1,'R')]:
        x=.36*side;hip=.14*side
        defs.extend([('upper_arm_'+label,(x,0,1.3),(x,0,1.01),'chest'),('forearm_'+label,(x,0,1.01),(x,-.07,.75),'upper_arm_'+label),('hand_'+label,(x,-.07,.75),(x,-.07,.68),'forearm_'+label),('thigh_'+label,(hip,0,.98),(hip,0,.54),'pelvis'),('shin_'+label,(hip,0,.54),(hip,0,.16),'thigh_'+label),('foot_'+label,(hip,0,.16),(hip,-.22,.08),'shin_'+label)])
    for name,p,q,parent in defs:
        b=arm.edit_bones.new(name);b.head=p;b.tail=q
        if parent:b.parent=arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False);return rig

def merge_parts(rig=None):
    groups=[];bpy.ops.object.select_all(action='DESELECT')
    mg=[(mat,[o for o in parts if o.data.materials[0]==mat]) for mat in A.M.values()]
    for mat,objs in mg:
        if not objs:continue
        for o in objs:o.select_set(True)
        bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();o=bpy.context.object;o.name='Fitter '+mat.name
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.008);bpy.ops.object.mode_set(mode='OBJECT')
        m=o.modifiers.new('Triangulated authored surfaces','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=m.name)
        if rig:
            m=o.modifiers.new('Fitter articulated skin','ARMATURE');m.object=rig;o.parent=rig
        o.select_set(False);groups.append(o)
    return groups

def animations(rig):
    sc=bpy.context.scene;sc.render.fps=30;sc.frame_start=0
    for clip,last in [('idle',60),('walk',30),('windup',21)]:
        action=bpy.data.actions.new(clip);rig.animation_data_create();rig.animation_data.action=action
        for frame in range(last+1):
            sc.frame_set(frame)
            for b in rig.pose.bones:b.rotation_mode='XYZ';b.rotation_euler=(0,0,0);b.location=(0,0,0)
            t=frame/last
            if clip=='idle':
                rig.pose.bones['chest'].rotation_euler[0]=.018*math.sin(t*math.tau)
                rig.pose.bones['head'].rotation_euler[2]=.025*math.sin(t*math.tau)
            elif clip=='walk':
                s=math.sin(t*math.tau)
                for label,sign in [('L',1),('R',-1)]:
                    rig.pose.bones['thigh_'+label].rotation_euler[0]=.43*s*sign
                    rig.pose.bones['shin_'+label].rotation_euler[0]=-.45*max(0,-s*sign)
                    rig.pose.bones['upper_arm_'+label].rotation_euler[0]=-.18*s*sign
                    rig.pose.bones['forearm_'+label].rotation_euler[0]=-.08
                rig.pose.bones['pelvis'].location.y=.008*(1-math.cos(t*math.tau*2))
            else:
                # Anticipation then stock shove within the accepted 0.7 s attack.
                a=math.sin(min(t/.58,1)*math.pi/2) if t<.58 else max(0,1-(t-.58)/.42)
                rig.pose.bones['upper_arm_R'].rotation_euler[0]=-1.15*a
                rig.pose.bones['forearm_R'].rotation_euler[0]=-.7*a
                rig.pose.bones['chest'].rotation_euler[0]=.16*a
                rig.pose.bones['upper_arm_L'].rotation_euler[0]=-.28*a
            for b in rig.pose.bones:
                b.keyframe_insert('rotation_euler',frame=frame,group=b.name)
                if b.name=='pelvis':b.keyframe_insert('location',frame=frame,group=b.name)
        action.use_fake_user=True
    rig.animation_data.action=None;sc.frame_set(0)

def metrics(name,pivot,forward,clips):
    path=os.path.join(OUT,name+'.glb');raw=open(path,'rb').read();jl=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+jl])
    tris=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
    positions=[g['accessors'][p['attributes']['POSITION']] for m in g['meshes'] for p in m['primitives']]
    lo=[min(a['min'][i] for a in positions) for i in range(3)];hi=[max(a['max'][i] for a in positions) for i in range(3)]
    start=20+jl+8;images=[]
    for im in g.get('images',[]):
        bv=g['bufferViews'][im['bufferView']];data=raw[start+bv.get('byteOffset',0):start+bv.get('byteOffset',0)+bv['byteLength']]
        images.append({'name':im.get('name'),'sha256':hashlib.sha256(data).hexdigest(),'embedded':True,'bytes':len(data)})
    return {'id':'deepward/'+name,'url':'/models/imported/deepward/fitter/'+name+'.glb','file':name+'.glb','sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'triangles':tris,'primitives':sum(len(m['primitives']) for m in g['meshes']),'materials':len(g['materials']),'bounds':{'min':lo,'max':hi},'dims':[round(hi[i]-lo[i],5) for i in range(3)],'pivot':pivot,'forward':forward,'clips':clips,'images':images,'skinJoints':len(g.get('skins',[{}])[0].get('joints',[])) if g.get('skins') else 0}

results=[]
for name,build in [('fitter-salvage-operator',fitter),('service-sidearm',lambda:weapon(False)),('service-rifle',lambda:weapon(True))]:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);parts=[]
    if name=='fitter-salvage-operator':
        build();rig=create_rig();merge_parts(rig);animations(rig)
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_nla_strips=False,export_force_sampling=True,export_skins=True,export_all_influences=False,export_cameras=False,export_lights=False)
        results.append(metrics(name,'floor centre','+Z',['idle','walk','windup']))
    else:
        parts=build();merge_parts()
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',export_yup=True,export_cameras=False,export_lights=False)
        results.append(metrics(name,'grip centre','-Z',[]))
with open(os.path.join(OUT,'asset-manifest.json'),'w') as f:json.dump({'schema':1,'author':'Deepward project contributors','original':True,'license':'CC0-1.0','source':'scripts/build-original-fitter.py','units':'metres','models':results},f,indent=2);f.write('\n')
