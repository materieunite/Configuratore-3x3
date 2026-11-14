import rhino3dm as r, numpy as np, trimesh, fast_simplification as fs, json, collections
m=r.File3dm.Read("Stand_cartone_pulito.3dm")
def meshes(g):
    if isinstance(g,r.Mesh): return [g]
    if isinstance(g,r.Extrusion): x=g.GetMesh(r.MeshType.Any); return [x] if x else []
    if isinstance(g,r.Brep): return [x for x in (f.GetMesh(r.MeshType.Any) for f in g.Faces) if x]
    return []
def tm(g):
    V=[];F=[];N=[];n=0
    for mm in meshes(g):
        V+= [(p.X,p.Y,p.Z) for p in mm.Vertices]
        hasN=len(mm.Normals)==len(mm.Vertices)
        N+= [(q.X,q.Y,q.Z) for q in mm.Normals] if hasN else [(0,0,0)]*len(mm.Vertices)
        for a,b,c,d in mm.Faces:
            F.append((a+n,b+n,c+n))
            if c!=d: F.append((a+n,c+n,d+n))
        n+=len(mm.Vertices)
    if not F: return None
    V=np.array(V)/1000.0; V=np.c_[V[:,0],V[:,2],-V[:,1]]  # Z-up mm -> Y-up m
    N=np.array(N); N=np.c_[N[:,0],N[:,2],-N[:,1]]
    t=trimesh.Trimesh(V,np.array(F),vertex_normals=N if np.abs(N).sum()>0 else None,process=False)
    return t
custom={"Stand::Pannelli logo":"logo","Stand::Grafica banco laterale":"banco","Stand::Nicchie colore":"nicchia"}
groups=collections.defaultdict(list); singles=[]
for o in m.Objects:
    L=m.Layers[o.Attributes.LayerIndex].FullPath
    if L=="Riferimenti::Figura umana": continue
    t=tm(o.Geometry)
    if t is None: continue
    if L=="Stand::Sgabelli":
        b=o.Geometry.GetBoundingBox(); d=sorted([b.Max.X-b.Min.X,b.Max.Y-b.Min.Y,b.Max.Z-b.Min.Z])
        L+= "::metallo" if d[2]<30 else "::cartone" if abs(d[0]-13.5)<0.6 else "::legno"
    if L in custom: singles.append((custom[L],t))
    else: groups[L].append(t)
scene=trimesh.Scene(); info={}
def planar_uv(t,name):
    # dominant normal by area
    fn=t.face_normals; ar=t.area_faces
    # cluster normals: take area weighted abs; choose face with largest area direction
    nrm=fn[np.argmax(ar)]
    # gather faces aligned with it
    al=(fn@nrm)>0.95
    if ar[al].sum()<0.3*ar.sum(): nrm=nrm
    up=np.array([0,1,0.]) if abs(nrm[1])<0.9 else np.array([0,0,-1.])
    u=np.cross(up,nrm); u/=np.linalg.norm(u); v=np.cross(nrm,u)
    P=t.vertices; pu=P@u; pv=P@v
    # use extents of the front face only
    fv=np.unique(t.faces[al]); umin,umax=pu[fv].min(),pu[fv].max(); vmin,vmax=pv[fv].min(),pv[fv].max()
    uv=np.c_[(pu-umin)/(umax-umin),(pv-vmin)/(vmax-vmin)]
    info[name]={"w":round(umax-umin,3),"h":round(vmax-vmin,3),"normal":np.round(nrm,3).tolist(),"center":np.round(t.bounds.mean(0),3).tolist()}
    return uv
def planar_sub(t,name):
    nrm=np.array(info[name]["normal"]); up=np.array([0,1,0.]) if abs(nrm[1])<0.9 else np.array([0,0,-1.])
    u=np.cross(up,nrm); u/=np.linalg.norm(u); v=np.cross(nrm,u)
    pu=t.vertices@u; pv=t.vertices@v
    return np.c_[(pu-pu.min())/max(np.ptp(pu),1e-6),(pv-pv.min())/max(np.ptp(pv),1e-6)]
cnt=collections.Counter()
order={"logo":[],"banco":[],"nicchia":[]}
for k,t in singles: order[k].append(t)
# sort deterministically
for k in order: order[k].sort(key=lambda t:tuple(np.round(t.bounds.mean(0),2)))
for k,lst in order.items():
    for i,t in enumerate(lst):
        name=f"{k}_{i+1}"
        uv=planar_uv(t,name)
        nrm=np.array(info[name]["normal"]); front=(t.face_normals@nrm)>0.9
        tf=t.submesh([np.where(front)[0]],append=True); 
        idx=np.unique(t.faces[front]); 
        # remap uv for submesh: recompute via projection on submesh vertices
        uvf=planar_sub(tf,name)
        tf.visual=trimesh.visual.TextureVisuals(uv=uvf,material=trimesh.visual.material.PBRMaterial(name=name,baseColorFactor=[1,1,1,1],roughnessFactor=0.9,metallicFactor=0))
        scene.add_geometry(tf,node_name=name,geom_name=name)
        if (~front).any():
            tb=t.submesh([np.where(~front)[0]],append=True); tb.visual=trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(name="bordo",baseColorFactor=[1,1,1,1],roughnessFactor=0.95,metallicFactor=0))
            scene.add_geometry(tb,node_name=name+"_bordo",geom_name=name+"_bordo")
gname={"Stand::Pareti cartone":"pareti","Stand::Cassa legno":"cassa","Stand::Cassa legno::Ruote":"ruote","Stand::Sgabelli::cartone":"sgabelli_cartone","Stand::Sgabelli::legno":"sgabelli_legno","Stand::Sgabelli::metallo":"sgabelli_metallo","Riferimenti::Prodotti":"prodotti"}
target={"sgabelli_cartone":36000,"sgabelli_legno":20000,"sgabelli_metallo":3000,"ruote":4000}
for L,lst in groups.items():
    nm=gname[L]
    if nm in target:
        tot=sum(len(x.faces) for x in lst); ratio=min(1,target[nm]/tot); out=[]
        for x in lst:
            x=trimesh.Trimesh(x.vertices,x.faces,process=True)  # merge vertici per oggetto
            if len(x.faces)>400 and ratio<1:
                v,f=fs.simplify(x.vertices.astype(np.float32),x.faces.astype(np.int32),target_reduction=1-ratio)
                x=trimesh.Trimesh(v,f,process=True)
            x.fix_normals(); out.append(x)
        lst=out
    t=trimesh.util.concatenate(lst)
    if nm in ("cassa","sgabelli_legno","sgabelli_cartone"):  # UV planari nel mondo: venatura / onda del cartone
        P=t.vertices; uv=np.c_[P[:,0]+P[:,2],P[:,1]]*1.0 if nm!="sgabelli_cartone" else np.c_[P[:,0],P[:,1]-P[:,2]]
        t.visual=trimesh.visual.TextureVisuals(uv=uv,material=trimesh.visual.material.PBRMaterial(name=nm,baseColorFactor=[1,1,1,1],roughnessFactor=0.8,metallicFactor=0))
    else:
        t.visual=trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(name=nm,baseColorFactor=[1,1,1,1],roughnessFactor=0.95,metallicFactor=0))
    scene.add_geometry(t,node_name=nm,geom_name=nm); print(nm,len(t.faces))
# center footprint
b=scene.bounds; off=np.array([-(b[0][0]+b[1][0])/2,0,-(b[0][2]+b[1][2])/2])
scene.apply_translation(off)
for k in info: info[k]["center"]=(np.array(info[k]["center"])+off).round(3).tolist()
scene.export("stand.glb",include_normals=True)
json.dump(info,open("panels.json","w"),indent=1); print(json.dumps(info,indent=0)); print(scene.bounds)
