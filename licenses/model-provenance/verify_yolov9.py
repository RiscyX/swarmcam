# Verify the exact local ONNX artifact against the official YOLOv9 v0.1 asset.
# Requires Python 3 and NumPy. Does not import PyTorch or execute checkpoint classes.
# Fusion equations: WongKinYiu/yolov9 models/common.py; upstream GPL notice is
# retained in ../YOLOv9-GPL-3.0.txt. SwarmCam audit code: root AGPL-3.0-only.
import collections,io,pickle,zipfile,hashlib,json,sys
from pathlib import Path
import numpy as np

class Node: pass
class Tensor:
 def __init__(self,storage,offset,shape,stride):
  self.storage=storage;self.offset=offset;self.shape=shape;self.stride=stride

def rebuild(storage,offset,shape,stride,*args):return Tensor(storage,offset,shape,stride)
class Reader(pickle.Unpickler):
 def find_class(self,module,name):
  if module=='collections' and name=='OrderedDict':return collections.OrderedDict
  if module in ['__builtin__','builtins'] and name=='set':return set
  if module=='torch' and name in ['FloatStorage','HalfStorage','LongStorage']:return name
  if module=='torch._utils' and name=='_rebuild_tensor_v2':return rebuild
  if module=='torch._utils' and name=='_rebuild_parameter':return lambda t,*args:t
  if module.startswith('models.') or module.startswith('torch.nn.modules.'):
   return type(name,(Node,),{})
  raise ValueError((module,name))
 def persistent_load(self,pid):
  tag,kind,key,loc,size=pid
  assert tag=='storage'
  return (kind,key,size)

def vint(b,i):
 v=0;s=0
 while True:
  c=b[i];i+=1;v|=(c&127)<<s
  if c<128:return v,i
  s+=7

def fields(b):
 i=0
 while i<len(b):
  tag,i=vint(b,i);n=tag>>3;w=tag&7
  if w==0:v,i=vint(b,i)
  elif w==2:
   length,i=vint(b,i);v=b[i:i+length];i+=length
  elif w in (1,5):length=8 if w==1 else 4;v=b[i:i+length];i+=length
  else:raise ValueError(w)
  yield n,w,v

def read_onnx(path):
 result={}
 graph=next(v for n,w,v in fields(Path(path).read_bytes()) if n==7)
 for n,w,v in fields(graph):
  if n!=5:continue
  f=list(fields(v));name=next(x.decode() for k,t,x in f if k==8)
  dtype=next(x for k,t,x in f if k==2)
  dims=[]
  for k,t,x in f:
   if k==1:
    if t==0:dims.append(x)
    else:
     i=0
     while i<len(x):d,i=vint(x,i);dims.append(d)
  raw=next((x for k,t,x in f if k==9),None)
  if raw is None:continue
  result[name]=np.frombuffer(raw,dtype={1:'<f4',7:'<i8',10:'<f2'}[dtype]).reshape(dims)
 return result

if len(sys.argv)!=3:
 raise SystemExit('Usage: python3 licenses/model-provenance/verify_yolov9.py LOCAL_ONNX UPSTREAM_PT')
local_path,reference_path=map(Path,sys.argv[1:])
assert hashlib.sha256(reference_path.read_bytes()).hexdigest()=='09bf9ca4adef37944f4406455b5b81b451c1e67307916e4702da68cda4d3e46d','Unexpected reference checkpoint'
assert hashlib.sha256(local_path.read_bytes()).hexdigest()=='f0558c02d5f7e01b9b83dfd4e2322e3f56721a77d70c2458cbd6a2d4a9cfaa9c','Unexpected local ONNX artifact'
z=zipfile.ZipFile(reference_path)
prefix=next(n for n in z.namelist() if n.endswith('/data.pkl')).rsplit('/',1)[0]
checkpoint=Reader(io.BytesIO(z.read(prefix+'/data.pkl'))).load()
root=checkpoint['model']
params={};modules={}
def array(t):
 kind,key,size=t.storage;dtype={'FloatStorage':'<f4','HalfStorage':'<f2','LongStorage':'<i8'}[kind]
 raw=z.read(prefix+'/data/'+str(key));item=np.dtype(dtype).itemsize
 return np.ndarray(t.shape,dtype=dtype,buffer=raw,offset=t.offset*item,strides=tuple(v*item for v in t.stride)).astype(np.float32)
def walk(m,path=''):
 modules[path]=m
 for label in ['_parameters','_buffers']:
  for k,t in getattr(m,label,{}).items():
   if isinstance(t,Tensor):params[(path+'.'+k).lstrip('.')]=array(t)
 for k,c in getattr(m,'_modules',{}).items():
  if c is not None:walk(c,(path+'.'+k).lstrip('.'))
walk(root)
onnx=read_onnx(local_path)
def fuse_conv(path):
 m=modules[path]
 if type(m).__name__=='Conv':
  w=params[path+'.conv.weight'];b=params.get(path+'.conv.bias',np.zeros(w.shape[0],np.float32))
  bn=modules.get(path+'.bn')
  if bn is None:return w,b
  gamma=params[path+'.bn.weight'];beta=params[path+'.bn.bias'];mean=params[path+'.bn.running_mean'];var=params[path+'.bn.running_var']
  scale=gamma/np.sqrt(var+bn.eps)
  return w*scale[:,None,None,None],beta+(b-mean)*scale
 if type(m).__name__=='RepConvN':
  a,ab=fuse_conv(path+'.conv1');b,bb=fuse_conv(path+'.conv2')
  assert getattr(m,'_modules',{}).get('bn') is None
  return a+np.pad(b,((0,0),(0,0),(1,1),(1,1))),ab+bb
 raise ValueError((path,type(m).__name__))
verified=[];unverified=[];stats=[]
for k,v in onnx.items():
 expected=params.get(k)
 if k.endswith('.conv.weight') or k.endswith('.conv.bias'):
  path=k.rsplit('.conv.',1)[0]
  if path in modules and type(modules[path]).__name__ in ['Conv','RepConvN']:
   w,b=fuse_conv(path);expected=w if k.endswith('weight') else b
 if expected is not None and expected.shape==v.shape:
  diff=float(np.max(np.abs(expected-v))) if v.size else 0
  good=np.allclose(expected,v,rtol=2e-5,atol=2e-6)
  if good:verified.append((k,v.size));stats.append(diff)
  else:unverified.append((k,v.shape,diff))
 else:unverified.append((k,v.shape,None))


for k,shape,diff in unverified:
 v=onnx[k]
 if k=='model.22.strides':
  expected=np.concatenate([np.full((s*s,),stride,np.float32) for s,stride in [(40,8),(20,16),(10,32)]])[None,:]
 elif k=='unsqueeze':
  levels=[]
  for side in [40,20,10]:
   y,x=np.meshgrid(np.arange(side,dtype=np.float32)+0.5,np.arange(side,dtype=np.float32)+0.5,indexing='ij')
   levels.append(np.stack([x,y]).reshape(2,-1))
  expected=np.concatenate(levels,axis=1)[None,:,:]
 else:
  expected=np.asarray({'val_194':[1,144,-1],'val_211':[1,4,16,2100],'val_222':[1,4,2100],'scalar_tensor_default':2.0,'val_86':[1.0,1.0,2.0,2.0],'val_205':[64,80]}[k],dtype=v.dtype)
 assert np.array_equal(v,expected),k

assert len(verified)==371 and len(unverified)==8

print(json.dumps({'status':'verified','model':'WongKinYiu YOLOv9-s converted','learned_tensors_verified':len(verified),'learned_values_verified':sum(n for k,n in verified),'max_abs_difference':max(stats),'rtol':2e-5,'atol':2e-6,'derived_export_constants_verified':len(unverified),'total_initializers':len(onnx)},indent=2))
