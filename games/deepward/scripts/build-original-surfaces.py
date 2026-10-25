"""Reproducible original tileable station surface maps; Python, NumPy, Pillow.

python3 deepward/scripts/build-original-surfaces.py
These are authored grain/wear maps, not photographed material scans.
All fields wrap at the image edges. Placement and UV repeat belong to the game.
"""
import os,json,hashlib
import numpy as np
from PIL import Image
OUT=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'public/models/imported/deepward/surfaces')
os.makedirs(OUT,exist_ok=True)
N=256;rng=np.random.default_rng(40606)
def smooth(field,passes):
    for _ in range(passes):field=(field+np.roll(field,1,0)+np.roll(field,-1,0)+np.roll(field,1,1)+np.roll(field,-1,1))/5
    return field
def normalized(field):return (field-field.min())/(field.max()-field.min())
def normal(height,strength):
    x=(np.roll(height,1,1)-np.roll(height,-1,1))*strength
    y=(np.roll(height,1,0)-np.roll(height,-1,0))*strength
    v=np.stack((x,y,np.ones_like(x)),-1);v/=np.linalg.norm(v,axis=-1,keepdims=True)
    return v*.5+.5
entries=[]
def save(name,role,array):
    filename=name+'-'+role+'.png';path=os.path.join(OUT,filename)
    pixels=(np.clip(array,0,1)*255+.5).astype(np.uint8)
    Image.fromarray(pixels).save(path,optimize=True)
    with Image.open(path) as decoded:assert decoded.size==(N,N);decoded.load()
    raw=open(path,'rb').read()
    entries.append({'id':'deepward/'+name+'/'+role,'file':filename,'url':'/models/imported/deepward/surfaces/'+filename,'role':role,'colorSpace':'srgb' if role=='color' else 'linear','width':N,'height':N,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
grain=rng.random((N,N));mottle=normalized(smooth(grain,35))
scratch=np.zeros((N,N))
for i in range(170):
    x,y=rng.integers(0,N,2);length=rng.integers(3,34)
    for t in range(length):scratch[(y+t//8)%N,(x+t)%N]=rng.uniform(.2,.8)
coating=.94+(mottle-.5)*.1+(grain-.5)*.025-scratch*.095
save('station-enamel','color',np.stack((coating,coating*.988,coating*.94),-1))
save('station-enamel','roughness',.43+(mottle-.5)*.2+scratch*.18)
save('station-enamel','normal',normal(grain*.025+scratch*.027,.75))
aggregate=rng.random((N,N));stain=normalized(smooth(rng.random((N,N)),90))
grease=np.maximum(0,.41-stain)*.42
fleck=(aggregate<.1).astype(float)*.025
floor=.86+(mottle-.5)*.14+(aggregate-.5)*.065-grease-fleck-scratch*.055
save('station-floor','color',np.stack((floor*.985,floor,floor*.974),-1))
save('station-floor','roughness',.77+(mottle-.5)*.15-grease*.5+fleck)
save('station-floor','normal',normal(aggregate*.09+mottle*.1-scratch*.045,1.2))
with open(os.path.join(OUT,'asset-manifest.json'),'w') as f:
    json.dump({'schema':1,'author':'Deepward project contributors','original':True,'license':'CC0-1.0','source':'scripts/build-original-surfaces.py','tileable':True,'maps':'Original authored enamel grain/scuffs and mineral floor grain/grease; not scanned PBR data. Neutral color maps multiply the editor palette.','recommendedRepeatMetres':{'station-enamel':1.2,'station-floor':1.0},'images':entries},f,indent=2);f.write('\n')
