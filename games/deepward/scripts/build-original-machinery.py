"""Original Deepward hard-surface art. Blender 4.3+: blender -b -t 2 -P this_file.

All dimensions below are model-local metres; world placement belongs to the editor.
Blender +Z is height, -Y is the operator-facing side; export is glTF +Y up/+Z front.
No third-party meshes, texture images, fonts, or geometry libraries are included.
"""
import bpy, math, json, os, sys, hashlib, struct
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public/models/imported/deepward')
EVIDENCE = os.environ.get('DEEPWARD_ASSET_EVIDENCE')
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
M = {}
def material(name, color, metal=0, rough=.5, emission=0):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    bsdf=m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Metallic'].default_value=metal; bsdf.inputs['Roughness'].default_value=rough
    if emission:
        bsdf.inputs['Emission Color'].default_value=(*color,1)
        bsdf.inputs['Emission Strength'].default_value=emission
    M[name]=m; return m
material('Petrol enamel',(.045,.22,.23),.38,.34)
material('Aged ivory enamel',(.68,.64,.49),.22,.42)
material('Cast graphite iron',(.052,.066,.068),.72,.44)
material('Machined steel',(.36,.42,.43),.86,.28)
material('Copper ink plumbing',(.38,.18,.075),.78,.34)
material('Black rubber and ink',(.014,.022,.024),.04,.82)
material('Paper and gauge face',(.88,.84,.68),0,.75)
material('Warning ochre',(.8,.43,.075),.32,.43)
material('Live mint indicator',(.16,.7,.48),.15,.28,1.4)
material('Dark red enamel',(.32,.06,.032),.2,.43)

def original_surface_maps():
    rng=np.random.default_rng(240419);n=256
    def smooth(field,passes):
        for _ in range(passes):field=(field+np.roll(field,1,0)+np.roll(field,-1,0)+np.roll(field,1,1)+np.roll(field,-1,1))/5
        return field
    grain=rng.random((n,n)).astype(np.float32)
    mottled=smooth(grain,28);mottled=(mottled-mottled.min())/(mottled.max()-mottled.min())
    abrasion=np.zeros((n,n),np.float32)
    for i in range(210):
        x,y=rng.integers(0,n,2);length=rng.integers(4,48)
        for t in range(length):abrasion[(y+t//9)%n,(x+t)%n]=rng.uniform(.3,.9)
    chips=smooth(rng.random((n,n)).astype(np.float32),5)
    chips=(chips<.35).astype(np.float32)
    pores=(grain<.055).astype(np.float32)
    normals=np.stack((.5+(np.roll(grain,1,1)-np.roll(grain,-1,1))*.055,.5+(np.roll(grain,1,0)-np.roll(grain,-1,0))*.055,np.ones((n,n)),np.ones((n,n))),-1)
    def image(name,pixels,colorspace):
        im=bpy.data.images.new(name,width=n,height=n,alpha=True)
        im.colorspace_settings.name=colorspace;im.pixels.foreach_set(pixels.astype(np.float32).ravel())
        im.file_format='PNG';im.pack();return im
    normal=image('Original fine manufactured grain normal',normals,'Non-Color')
    for name in ['Petrol enamel','Aged ivory enamel','Cast graphite iron','Machined steel','Copper ink plumbing','Warning ochre','Dark red enamel']:
        mat=M[name];bsdf=mat.node_tree.nodes.get('Principled BSDF');nodes=mat.node_tree.nodes;links=mat.node_tree.links
        color=np.array(mat.diffuse_color[:3]);base=color[None,None,:]*(.9+mottled[:,:,None]*.16+(grain[:,:,None]-.5)*.04)
        # Reproducible original worn coating; these are authored maps, not scans.
        worn=np.maximum(chips*.85,abrasion*.2)
        if 'enamel' in name or 'ochre' in name:
            base=base*(1-worn[:,:,None])+np.array([.22,.235,.23])*worn[:,:,None]
        else:base=base*(1-pores[:,:,None]*.16)+abrasion[:,:,None]*.035
        rgba=np.concatenate((np.clip(base,0,1),np.ones((n,n,1))),-1)
        rough=float(bsdf.inputs['Roughness'].default_value)
        r=np.clip(rough+(mottled-.5)*.16+abrasion*.12+chips*.15,0,1)
        rough_rgba=np.stack((r,r,r,np.ones((n,n))),-1)
        col=image('Original '+name+' color wear',rgba,'sRGB')
        rou=image('Original '+name+' roughness',rough_rgba,'Non-Color')
        c=nodes.new('ShaderNodeTexImage');c.image=col;links.new(c.outputs['Color'],bsdf.inputs['Base Color'])
        rr=nodes.new('ShaderNodeTexImage');rr.image=rou;links.new(rr.outputs['Color'],bsdf.inputs['Roughness'])
        nn=nodes.new('ShaderNodeTexImage');nn.image=normal;nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.45
        links.new(nn.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])
original_surface_maps()

def finish(o, mat, bevel=0, smooth=False):
    o.data.materials.append(M[mat])
    if bevel:
        mod=o.modifiers.new('Manufactured edge radius','BEVEL'); mod.width=bevel; mod.segments=2
        mod.affect='EDGES'; mod.profile=.5
        bpy.context.view_layer.objects.active=o
        bpy.ops.object.modifier_apply(modifier=mod.name)
        wn=o.modifiers.new('Weighted surface normals','WEIGHTED_NORMAL'); wn.keep_sharp=True; wn.weight=40
        bpy.ops.object.modifier_apply(modifier=wn.name)
    if smooth:
        for p in o.data.polygons: p.use_smooth=True
    return o

def box(name,p,d,mat='Petrol enamel',bevel=.025,rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=p); o=bpy.context.object; o.name=name
    o.scale=d; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if rot: o.rotation_euler=rot
    return finish(o,mat,bevel)

def cyl(name,p,r,h,mat='Machined steel',axis='Z',n=24,bevel=.01):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=h,location=p)
    o=bpy.context.object; o.name=name
    if axis=='X': o.rotation_euler[1]=math.pi/2
    if axis=='Y': o.rotation_euler[0]=math.pi/2
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,mat,bevel,True)

def tube(name,points,r=.028,mat='Copper ink plumbing'):
    c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.resolution_u=2
    c.bevel_depth=r; c.bevel_resolution=2; c.resolution_u=3
    s=c.splines.new('POLY'); s.points.add(len(points)-1)
    for v,p in zip(s.points,points): v.co=(*p,1)
    o=bpy.data.objects.new(name,c); bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return finish(o,mat,0,True)

def elbow(name,a,b,c,r=.027,mat='Copper ink plumbing'):
    av,bv,cv=Vector(a),Vector(b),Vector(c)
    pa=bv+(av-bv).normalized()*.12; pc=bv+(cv-bv).normalized()*.12
    pts=[a,pa]
    for j in range(1,7):
        t=j/6; pts.append(tuple((1-t)**2*pa+2*(1-t)*t*bv+t*t*pc))
    pts.append(c); return tube(name,pts,r,mat)

def torus(name,p,major,minor,mat='Machined steel',axis='Z'):
    bpy.ops.mesh.primitive_torus_add(major_segments=32,minor_segments=8,location=p,major_radius=major,minor_radius=minor)
    o=bpy.context.object;o.name=name
    if axis=='X':o.rotation_euler[1]=math.pi/2
    if axis=='Y':o.rotation_euler[0]=math.pi/2
    return finish(o,mat,0,True)

def bolt(p,axis='Y',r=.018):
    return cyl('Hex fastener',p,r,.018,'Machined steel',axis,6,0)

def facebolts(x,y,z,w,h):
    for a in [-1,1]:
        for b in [-1,1]:bolt((x+a*(w/2-.055),y,z+b*(h/2-.055)))

def text(word,p,size=.08,mat='Paper and gauge face'):
    bpy.ops.object.text_add(location=p,rotation=(math.pi/2,0,0));o=bpy.context.object
    o.name='Cast marking '+word;o.data.body=word;o.data.size=size;o.data.extrude=.0008
    o.data.align_x='CENTER';o.data.align_y='CENTER';o.data.space_character=1.1
    bpy.ops.object.convert(target='MESH');return finish(o,mat)

def profile(name,xy,x0,x1,mat):
    # Extruded side casting with a distinctive outline, in the Y/Z plane.
    n=len(xy); vs=[(x,y,z) for x in (x0,x1) for y,z in xy]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    fs.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    return finish(o,mat,.025)

def flange(p,axis='Y',r=.075):
    cyl('Pipe flange',p,r,.027,'Machined steel',axis,24,.003)
    for i in range(4):
        a=i*math.pi/2
        if axis=='Y': q=(p[0]+r*.68*math.cos(a),p[1]-.022,p[2]+r*.68*math.sin(a))
        elif axis=='X':q=(p[0]-.022,p[1]+r*.68*math.cos(a),p[2]+r*.68*math.sin(a))
        else:q=(p[0]+r*.68*math.cos(a),p[1]+r*.68*math.sin(a),p[2]+.022)
        bolt(q,axis,.012)

def gauge(x,y,z,r=.09):
    cyl('Gauge rim',(x,y,z),r,.05,'Machined steel','Y',32,.006)
    cyl('Gauge dial',(x,y-.028,z),r*.84,.008,'Paper and gauge face','Y',32,0)
    for i in range(9):
        a=math.radians(35+i*29)
        box('Dial graduation',(x+r*.65*math.cos(a),y-.034,z+r*.65*math.sin(a)),(.005,.004,.014),'Cast graphite iron',0, (0,a-math.pi/2,0))
    tube('Gauge needle',[(x,y-.042,z),(x+r*.59,y-.042,z+r*.18)],.004,'Dark red enamel')
    cyl('Gauge spindle',(x,y-.043,z),.013,.007,'Cast graphite iron','Y',12,0)

def wheel(p,r=.3,axis='X',mat='Cast graphite iron'):
    torus('Spoked wheel rim',p,r,min(.035,r*.1),mat,axis);cyl('Wheel hub',p,min(.09,r*.28),min(.14,r*.4),mat,axis)
    for i in range(6):
        a=i*math.pi/3
        if axis=='X': pts=[p,(p[0],p[1]+r*.93*math.cos(a),p[2]+r*.93*math.sin(a))]
        else:pts=[p,(p[0]+r*.93*math.cos(a),p[1],p[2]+r*.93*math.sin(a))]
        tube('Radial cast spoke',pts,min(.023,r*.065),mat)

def feet(xs,ys):
    for x in xs:
        for y in ys:
            box('Isolated machine foot',(x,y,.095),(.27,.31,.19),'Cast graphite iron',.035)
            for a in [-1,1]:cyl('Floor anchor',(x+a*.085,y,.2),.022,.015,'Machined steel','Z',6,0)

def roller(x,y,z,l,r=.15):
    cyl('Polished roller shaft',(x,y,z),r*.26,l+.22,'Machined steel','X',20)
    cyl('Ink transfer roller',(x,y,z),r,l,'Black rubber and ink','X',32,.008)
    for side in [-1,1]:
        cyl('Roller collar',(x+side*(l/2+.028),y,z),r*.88,.055,'Machined steel','X',20,.005)

def panel(p,w,h,label):
    x,y,z=p;box('Removable service hatch',p,(w,.05,h),'Aged ivory enamel',.024)
    facebolts(x,y-.038,z,w,h);text(label,(x,y-.038,z+h*.26),.055,'Cast graphite iron')
    for i in range(7):box('Stamped ventilation slot',(x-w*.3+i*w*.1,y-.029,z-h*.22),(w*.047,.009,h*.13),'Cast graphite iron',.008)

def press():
    feet([-.98,.98],[-.94,.9])
    box('Heavy press sole',(0,0,.3),(2.64,2.55,.27),'Cast graphite iron',.055)
    outline=[(-1.2,.43),(-1.2,1.35),(-.95,1.48),(-.95,2.1),(-.72,2.42),(.58,2.42),(.94,2.05),(1.04,.72),(.82,.43)]
    for side in [-1,1]:
        x=side*1.09;profile('Curved enamel press cheek',outline,x-.12,x+.12,'Petrol enamel')
        # Raised cast rib and concentric bearing mounts distinguish side silhouette.
        tube('Cast side reinforcement',[(x+side*.14,-1.03,.66),(x+side*.14,-.87,1.6),(x+side*.14,-.57,2.23),(x+side*.14,.6,2.23),(x+side*.14,.84,.67)],.04,'Aged ivory enamel')
        for y,z in [(-.55,1.86),(.08,1.97),(.65,1.74)]:
            cyl('Bearing boss',(x+side*.15,y,z),.19,.08,'Machined steel','X',24)
            for i in range(4):
                a=i*math.pi/2;bolt((x+side*.2,y+.145*math.cos(a),z+.145*math.sin(a)),'X')
    for y,z,r in [(-.72,1.94,.22),(-.16,2.08,.25),(.4,1.97,.21),(.81,1.68,.18)]:roller(0,y,z,1.94,r)
    for y in [-.76,-.52,-.28,-.04,.2]:roller(0,y,1.2,1.8,.078)
    box('Paper takeoff tray',(0,-.65,1.08),(1.9,1.07,.065),'Machined steel',.018)
    for x in [-.96,.96]:box('Raised paper guide',(x,-.66,1.15),(.045,1.06,.15),'Aged ivory enamel',.012)
    for i in range(4):box('Fed rag stock',(0,-.66,1.126+i*.003),(1.64,.92,.002),'Paper and gauge face',0)
    text('BELLWETHER / 04',(0,-1.281,.68),.12)
    panel((0,-1.29,.55),1.63,.36,'ROTARY SALVAGE PRESS')
    wheel((1.34,.18,.98),.39)
    cyl('Flywheel axle',(1.19,.18,.98),.07,.43,'Machined steel','X')
    cyl('Brake crank handle',(1.38,.4,.75),.035,.14,'Black rubber and ink','X')
    box('Ink trough',(0,.95,2.43),(1.95,.34,.15),'Aged ivory enamel',.04)
    box('Trough visible ink surface',(0,.95,2.514),(1.79,.21,.008),'Black rubber and ink',.005)
    for x in [-.7,0,.7]:elbow('Ink feed pipe', (x,1.15,.73),(x,1.15,2.62),(x,.96,2.62),.025)
    for x in [-.7,.7]:cyl('Ink pump pod',(x,1.12,.83),.14,.44,'Copper ink plumbing')
    box('Control stand',(-.91,-1.09,1.55),(.35,.25,.12),'Warning ochre',.025)
    for x,ma in [(-1.02,'Dark red enamel'),(-.9,'Live mint indicator'),(-.78,'Black rubber and ink')]:cyl('Operator pushbutton',(x,-1.231,1.58),.035,.03,ma,'Y',16,.003)
    for x in [-.82,.82]:tube('Guard arch',[(x,-1.08,1.42),(x,-1.08,1.78),(x,-.89,1.84)],.025,'Warning ochre')

def printer():
    feet([-.83,.83],[-.43,.43])
    box('Printer pedestal',(0,0,.66),(2.3,1.26,.93),'Petrol enamel',.045)
    for x in [-.74,.74]:panel((x,-.653,.68),.63,.6,'DW-12')
    profile('Left sloped press housing',[(-.6,1.12),(-.6,1.58),(-.35,1.93),(.5,1.93),(.62,1.12)],-1.05,-.82,'Aged ivory enamel')
    profile('Right sloped press housing',[(-.6,1.12),(-.6,1.58),(-.35,1.93),(.5,1.93),(.62,1.12)],.82,1.05,'Aged ivory enamel')
    for y,z in [(-.27,1.58),(.09,1.72),(.4,1.56)]:roller(0,y,z,1.57,.15)
    box('Printer feed table',(0,-.38,1.25),(1.66,.62,.07),'Machined steel',.015)
    box('Fed paper',(0,-.4,1.293),(1.41,.51,.007),'Paper and gauge face',.002)
    box('Crown instrument block',(0,.49,2.03),(1.82,.28,.3),'Petrol enamel',.025)
    text('MARROW / PRINT SERVICE',(0,.338,2.04),.095)
    for x in [-.63,-.35]:gauge(x,-.666,1.4,.07)
    for x in [.25,.45,.65]:cyl('Service switch',(x,-.665,1.42),.027,.027,'Warning ochre','Y',12,.004)
    wheel((1.16,.12,1.21),.22,'X','Copper ink plumbing')
    for x in [-.6,.6]:
        cyl('Printer ink sump',(x,.37,1.12),.15,.38,'Copper ink plumbing')
        elbow('Printer supply loop',(x,.38,1.24),(x,.66,1.24),(x,.66,2.19),.021)
        flange((x,.66,2.19),'Z',.048)
    for x in [-1.02,1.02]:box('Ivory foot trim',(x,0,.24),(.12,1.2,.08),'Aged ivory enamel',.015)

def pump():
    feet([-.64,.64],[-.95,.95]);box('Pump skid',(0,0,.27),(1.84,2.72,.19),'Cast graphite iron',.035)
    for x in [-.45,.45]:
        cyl('Ink pressure reservoir',(x,.35,1.45),.34,1.68,'Aged ivory enamel',n=32,bevel=.055)
        torus('Reservoir weld ring',(x,.35,.69),.341,.015,'Machined steel')
        torus('Reservoir weld ring',(x,.35,2.21),.341,.015,'Machined steel')
        cyl('Domed cap neck',(x,.35,2.35),.12,.16,'Machined steel')
        cyl('Tank service lid',(x,.35,2.46),.17,.05,'Petrol enamel')
        for i in range(6):
            a=i*math.pi/3;bolt((x+.135*math.cos(a),.35+.135*math.sin(a),2.49),'Z',.011)
        box('Tank maker plate',(x,.003,1.51),(.32,.023,.28),'Petrol enamel',.012)
        text('INK '+('A' if x<0 else 'B'),(x,-.015,1.54),.055)
        elbow('Return pipe',(x,.62,2.4),(x,.96,2.4),(x,.96,.61),.032)
        flange((x,.96,.67),'Z')
    cyl('Pump motor',(0,-.67,.74),.28,.69,'Petrol enamel','X',32,.025)
    for x in [-.22,-.14,-.06,.02,.1,.18]:torus('Motor cooling fin',(x,-.67,.74),.285,.019,'Cast graphite iron','X')
    cyl('Motor coupling',(.45,-.67,.74),.16,.24,'Machined steel','X')
    cyl('Volute pump body',(.66,-.67,.74),.23,.2,'Copper ink plumbing','X')
    elbow('Pressurized feed',(.67,-.67,.8),(.67,-1.04,.8),(.67,-1.04,1.68),.038)
    tube('Manifold header',[(-.68,-1.04,1.68),(.68,-1.04,1.68)],.049)
    for x in [-.45,.45]:
        flange((x,-1.04,1.68),'X',.075)
        tube('Meter stem',[(x,-1.04,1.68),(x,-1.04,1.96)],.02,'Machined steel')
        gauge(x,-1.065,2.01,.105)
        tube('Reservoir feed',[(x,-.97,1.68),(x,-.25,1.68),(x,.02,1.68)],.026)
        wheel((x,-1.13,1.48),.125,'Y','Dark red enamel')
    box('Instrumentation saddle',(0,-.27,2.55),(1.5,.22,.25),'Petrol enamel',.025)
    text('DW / INK RECOVERY',(0,-.391,2.55),.088)
    for x in [-.8,.8]:tube('Service safety rail',[(x,-1.19,.365),(x,-1.19,1.13),(x,-1,1.28)],.028,'Warning ochre')

def cabinet():
    box('Stash plinth',(0,0,.09),(1.64,1.12,.18),'Cast graphite iron',.025)
    box('Stash cabinet carcass',(0,.02,1.06),(1.58,1.04,1.92),'Petrol enamel',.035)
    box('Cabinet roof',(0,.02,2.05),(1.64,1.11,.1),'Aged ivory enamel',.024)
    for x in [-.38,.38]:
        box('Individual locker door',(x,-.527,1.25),(.735,.046,1.5),'Aged ivory enamel',.018)
        facebolts(x,-.56,1.25,.735,1.5)
        box('Recessed pull surround',(x+.23,-.559,1.22),(.084,.022,.22),'Cast graphite iron',.012)
        tube('Locker pull',[(x+.23,-.58,1.15),(x+.23,-.61,1.15),(x+.23,-.61,1.29),(x+.23,-.58,1.29)],.009,'Machined steel')
        for z in [1.76,1.71,1.66,1.61]:box('Door ventilation',(x,-.556,z),(.45,.006,.018),'Cast graphite iron',.004)
        text('BAY 0'+('1' if x<0 else '2'),(x,-.56,1.45),.056,'Cast graphite iron')
        box('Inventory label plate',(x,-.563,.72),(.42,.014,.15),'Petrol enamel',.006)
        text('BANKED SALVAGE',(x,-.574,.72),.036)
        for z in [.7,1.72]:box('Visible piano hinge',(x-.33,-.57,z),(.038,.046,.2),'Machined steel',.006)
    for x in [-.52,0,.52]:
        box('Lower parts drawer',(x,-.539,.3),(.49,.058,.22),'Aged ivory enamel',.009)
        tube('Drawer handle',[(x-.07,-.58,.3),(x-.07,-.62,.3),(x+.07,-.62,.3),(x+.07,-.58,.3)],.009,'Machined steel')
    text('MARROW / STORES',(0,-.54,1.96),.075,'Cast graphite iron')

def desk():
    for x in [-.78,.78]:box('Desk pedestal',(x,.03,.53),(.49,.76,1.02),'Petrol enamel',.035)
    for x in [-.78,.78]:box('Desk isolation pad',(x,.03,.015),(.47,.74,.03),'Cast graphite iron',.007)
    box('Worktop',(0,0,1.08),(2.18,.95,.13),'Aged ivory enamel',.035)
    for x in [-.78,.78]:
        for z in [.24,.54,.84]:
            box('Service drawer',(x,-.377,z),(.42,.032,.24),'Aged ivory enamel',.01)
            tube('Drawer pull',[(x-.08,-.405,z),(x-.08,-.44,z),(x+.08,-.44,z),(x+.08,-.405,z)],.008,'Machined steel')
    box('Register casing',(-.48,.12,1.28),(.66,.44,.3),'Petrol enamel',.023)
    box('Recessed register display',(-.48,-.114,1.32),(.42,.008,.12),'Black rubber and ink',.004)
    text('0047',(-.48,-.122,1.32),.063,'Live mint indicator')
    for i in range(4):cyl('Register key',(-.66+i*.12,-.124,1.2),.016,.009,'Paper and gauge face','Y',12,0)
    box('Ledger cover',(.52,-.04,1.161),(.51,.43,.027),'Dark red enamel',.009)
    box('Ledger pages',(.52,-.04,1.18),(.48,.41,.008),'Paper and gauge face',.001)
    for i in range(5):tube('Printed ledger rule',[(.32,-.18+i*.055,1.186),(.71,-.18+i*.055,1.186)],.0017,'Cast graphite iron')
    cyl('Ink stamp pot',(.83,.28,1.19),.055,.08,'Copper ink plumbing')
    tube('Task lamp stem',[(.11,.32,1.15),(.11,.32,1.53),(.11,.14,1.63)],.014,'Machined steel')
    box('Task lamp shade',(.11,.12,1.62),(.28,.19,.07),'Petrol enamel',.025)
    box('Lamp diffuser',(.11,.12,1.582),(.22,.14,.01),'Paper and gauge face',.003)
    text('SERVICE / RECONCILE',(0,-.481,1.08),.055,'Cast graphite iron')

def portal():
    # Unobstructed 4.8 m span and 2.8 m height; no invisible filled opening.
    for x in [-2.6,2.6]:
        for y in [-1.66,1.66]:
            box('Portal bolted foot',(x,y,.08),(.4,.46,.16),'Cast graphite iron',.025)
            box('Portal rolled upright',(x,y,1.62),(.35,.35,3.08),'Petrol enamel',.022)
            box('Upright front flange',(x,y-.19,1.65),(.4,.052,2.89),'Aged ivory enamel',.008)
            for z in [.22,.39,2.73,2.93]:
                for a in [-1,1]:bolt((x+a*.12,y-.226,z),'Y',.022)
            box('High visibility collar',(x,y-.225,1.08),(.39,.035,.21),'Warning ochre',.007)
    for y in [-1.66,1.66]:
        box('Overhead portal girder',(0,y,3.07),(5.6,.4,.46),'Petrol enamel',.032)
        box('Exposed girder web',(0,y-.219,3.07),(5.5,.055,.25),'Cast graphite iron',.012)
        for x in [-2.2,-1.1,0,1.1,2.2]:
            box('Girder web gusset',(x,y-.247,3.07),(.095,.047,.29),'Aged ivory enamel',.008)
            for z in [2.97,3.17]:bolt((x,y-.276,z),'Y',.017)
    for x in [-2.59,2.59]:box('Roof side rail',(x,0,3.23),(.3,3.8,.25),'Petrol enamel',.023)
    for x in [-1.95,-.98,0,.98,1.95]:box('Slender roof purlin',(x,0,3.31),(.075,3.76,.12),'Machined steel',.008)
    # Lapped solid roof uses modeled standing seams, edge drip, and service lighting.
    box('Canopy roof sheet',(0,0,3.4),(5.56,3.78,.055),'Aged ivory enamel',.012)
    for x in [-2.31,-1.54,-.77,0,.77,1.54,2.31]:box('Standing roof seam',(x,0,3.454),(.024,3.75,.061),'Aged ivory enamel',.007)
    for y in [-1.88,1.88]:box('Roof drip edge',(0,y,3.395),(5.55,.044,.12),'Machined steel',.009)
    for x in [-1.6,1.6]:
        box('Linear service luminaire',(x,0,2.848),(.7,.12,.075),'Cast graphite iron',.015)
        box('Luminaire diffuser',(x,0,2.803),(.6,.087,.009),'Paper and gauge face',.003)
    tube('Canopy electrical conduit',[(-2.4,-1.5,2.72),(-2.4,-1.5,3.28),(2.2,-1.5,3.28)],.022,'Copper ink plumbing')
    text('HOLLOWAY / LINE 06',(0,-1.948,3.07),.145)
    for x in [-2.6,2.6]:
        box('Upright junction housing',(x,-1.91,1.85),(.23,.12,.28),'Cast graphite iron',.018)
        facebolts(x,-1.981,1.85,.23,.28)

def trolley():
    for x in [-1.0,1.0]:
        box('Rail transfer side channel',(x,0,.34),(.25,1.65,.25),'Petrol enamel',.025)
        for y in [-.57,.57]:
            cyl('Rail wheel axle',(x,y,.211),.047,.41,'Machined steel','X')
            cyl('Solid rail wheel',(x,y,.211),.19,.13,'Cast graphite iron','X',32,.012)
            cyl('Rail wheel flange',(x-.06,y,.211),.211,.033,'Machined steel','X',32,.005)
            cyl('Wheel cap',(x+.08,y,.211),.07,.027,'Copper ink plumbing','X',16,.003)
            for i in range(6):
                a=i*math.pi/3;bolt((x+.1,y+.11*math.cos(a),.211+.11*math.sin(a)),'X',.012)
        box('Axle keeper',(x,0,.33),(.3,.34,.13),'Cast graphite iron',.018)
    for y in [-.67,.67]:box('Trolley crossmember',(0,y,.42),(2.4,.16,.15),'Cast graphite iron',.018)
    box('Transfer deck front fascia',(0,-.76,.66),(2.34,.13,.27),'Aged ivory enamel',.022)
    box('Transfer deck rear fascia',(0,.76,.66),(2.34,.13,.27),'Aged ivory enamel',.022)
    for x in [-1.13,1.13]:box('Trolley roller bed side',(x,0,.64),(.1,1.5,.2),'Petrol enamel',.018)
    for y in [-.6,-.4,-.2,0,.2,.4,.6]:
        cyl('Transfer bed steel roller',(0,y,.72),.085,2.1,'Machined steel','X',24,.004)
        for x in [-1.11,1.11]:cyl('Deck roller bearing',(x,y,.72),.041,.075,'Copper ink plumbing','X',16,.003)
    for x in [-.87,.87]:
        profile('Articulated paper clamp',[(-.57,.8),(-.57,.93),(-.33,1.04),(-.2,1.04),(-.2,.91),(-.42,.85)],x-.07,x+.07,'Warning ochre')
        cyl('Clamp screw',(x,-.4,1.01),.017,.16,'Machined steel')
        cyl('Knurled clamp knob',(x,-.4,1.085),.044,.027,'Black rubber and ink','Z',16,.004)
    box('Trolley brake pedal',(.65,-.79,.29),(.23,.1,.08),'Warning ochre',.014)
    tube('Brake linkage',[(.65,-.79,.29),(.65,-.52,.25),(1,-.52,.25)],.011,'Copper ink plumbing')
    text('DW / RAIL TRANSFER',(0,-.831,.68),.09,'Cast graphite iron')
    for x in [-1.02,1.02]:
        facebolts(x,-.835,.66,.21,.24)
        for z in [.59,.65,.71]:box('Trolley hazard plate stripe',(x,-.835,z),(.145,.007,.028),'Warning ochre',.002)
    for x in [-.76,.76]:
        tube('Low towing handle',[(x,.81,.48),(x,.86,.68),(x,.86,.88)],.025,'Machined steel')
    tube('Towing grip',[(-.76,.86,.88),(.76,.86,.88)],.027,'Black rubber and ink')

def export(name,build):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    build()
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    # One merged mesh per material, UVs regenerated on final manufactured surfaces.
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        bpy.context.view_layer.objects.active=o;o.select_set(True)
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
        if not o.data.uv_layers:
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
        o.select_set(False)
    groups=[]
    material_groups=[(mat,[o for o in meshes if o.data.materials and o.data.materials[0]==mat]) for mat in M.values()]
    bpy.ops.object.select_all(action='DESELECT')
    for mat,objs in material_groups:
        if not objs:continue
        for o in objs:o.select_set(True)
        bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join()
        obj=bpy.context.object;obj.name=name+' | '+mat.name
        # Origin is always floor-centre of the asset, not centre of a material group.
        bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        tri=obj.modifiers.new('Triangulated manufactured faces','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
        obj.select_set(False);groups.append(obj)
    path=os.path.join(OUT,name+'.glb')
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False,export_extras=True)
    print('DEEPWARD_EXPORTED',name)
    if EVIDENCE:
        os.makedirs(EVIDENCE,exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(EVIDENCE,name+'.blend'))
        render(name,groups)

def render(name,groups):
    sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=24
    sc.cycles.use_denoising=False;sc.render.resolution_x=1000;sc.render.resolution_y=800;sc.render.resolution_percentage=100
    sc.world.color=(.17,.17,.17)
    box('Studio floor',(0,0,-.08),(200,200,.1),'Cast graphite iron',0)
    coords=[o.matrix_world@Vector(c) for o in groups for c in o.bound_box]
    lo=Vector(tuple(min(v[i] for v in coords) for i in range(3)));hi=Vector(tuple(max(v[i] for v in coords) for i in range(3)))
    center=(lo+hi)*.5; size=max(hi-lo)
    for pos,power,scale in [((size*1.7,-size*1.8,size*2.8),1200*size,5),((-size*1.5,-size*.5,size*1.8),700*size,4),((size*.2,size*2,size*2.1),1300*size,3)]:
        bpy.ops.object.light_add(type='AREA',location=pos);l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=scale
        l.rotation_euler=(center-l.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(size*1.4,-size*1.75,size*1.2))
    c=bpy.context.object;c.rotation_euler=(center-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=size*1.9;sc.camera=c
    sc.render.filepath=os.path.join(EVIDENCE,name+'.png');bpy.ops.render.render(write_still=True)

def main():
    selected=os.environ.get('DEEPWARD_ASSET_ONLY','').split(',')
    for name,build in [('bellwether-rotary-press',press),('marrow-salvage-printer',printer),('duplex-ink-recovery',pump),('marrow-stash-cabinet',cabinet),('marrow-service-desk',desk),('marrow-receiving-portal',portal),('marrow-rail-transfer',trolley)]:
        if selected==[''] or name in selected:export(name,build)

    manifest={'schema':1,'author':'Deepward project contributors','license':'CC0-1.0','original':True,'source':'scripts/build-original-machinery.py','units':'metres','pivot':'floor centre [0,0,0]','facing':'+Z','up':'+Y','textures':'Embedded original 256px enamel/metal wear color, roughness and fine grain normal maps; deterministic authored patterns, not photographed scans. CC0-1.0.','models':[]}
    for fn in sorted(os.listdir(OUT)):
        if not fn.endswith('.glb'):continue
        path=os.path.join(OUT,fn);raw=open(path,'rb').read();jl=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+jl])
        tris=0;prims=0;bounds=[];uv=0
        for mesh in g['meshes']:
            for p in mesh['primitives']:
                prims+=1;uv+=int('TEXCOORD_0' in p['attributes'])
                a=g['accessors'][p['attributes']['POSITION']];bounds.append((a['min'],a['max']))
                tris+=g['accessors'][p['indices']]['count']//3 if 'indices' in p else a['count']//3
        lo=[min(b[0][i] for b in bounds) for i in range(3)];hi=[max(b[1][i] for b in bounds) for i in range(3)]
        bin_start=20+jl+8;images=[]
        for im in g.get('images',[]):
            bv=g['bufferViews'][im['bufferView']];data=raw[bin_start+bv.get('byteOffset',0):bin_start+bv.get('byteOffset',0)+bv['byteLength']]
            images.append({'name':im.get('name'),'mimeType':im['mimeType'],'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'embedded':True})
        manifest['models'].append({'id':'deepward/'+fn[:-4],'file':fn,'url':'/models/imported/deepward/'+fn,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'bounds':{'min':lo,'max':hi},'dims':[round(hi[i]-lo[i],5) for i in range(3)],'footprint':[round(hi[0]-lo[0],5),round(hi[2]-lo[2],5)],'minY':lo[1],'maxY':hi[1],'triangles':tris,'staticDrawCalls':prims,'materialCount':len(g['materials']),'uvPrimitives':uv,'images':images,'collision':'fit box for machinery; portal must use editor posts/beams only, never fit its opening','uncompressed':True})
    with open(os.path.join(OUT,'asset-manifest.json'),'w') as f:json.dump(manifest,f,indent=2);f.write('\n')

if __name__=='__main__':main()
