import rhino3dm as r, sys
src=r.File3dm.Read(sys.argv[1]); out=r.File3dm()
out.Settings.ModelUnitSystem=r.UnitSystem.Millimeters
OX,OY=32641,-72
def mat(name,rgb):
    m=r.Material(); m.Name=name; m.DiffuseColor=(*rgb,255); return out.Materials.Add(m)
M={k:mat(*v) for k,v in {
 "pareti":("Cartone bianco",(236,234,228)),
 "stampa":("Cartone stampato",(245,245,245)),
 "loghi":("Pannelli logo",(250,250,250)),
 "legno":("Legno cassa",(196,154,104)),
 "ruote":("Ruote",(40,40,40)),
 "sgabelli":("Sgabelli",(230,228,222)),
 "prodotti":("Prodotti",(200,200,200)),
 "figura":("Figura",(180,180,180))}.items()}
def layer(path,rgb,mk,vis=True):
    l=r.Layer(); l.Name=path.split("::")[-1]; l.Color=(*rgb,255); l.RenderMaterialIndex=M[mk]; l.Visible=vis
    if "::" in path: l.ParentLayerId=out.Layers[LI[path.rsplit("::",1)[0]]].Id
    LI[path]=out.Layers.Add(l)
LI={}
p=r.Layer(); p.Name="Stand"; LI["Stand"]=out.Layers.Add(p)
p=r.Layer(); p.Name="Riferimenti"; LI["Riferimenti"]=out.Layers.Add(p)
layer("Stand::Pareti cartone",(200,200,200),"pareti")
layer("Stand::Grafica banco laterale",(255,120,0),"stampa")
layer("Stand::Nicchie colore",(255,170,0),"stampa")
layer("Stand::Pannelli logo",(0,120,255),"loghi")
layer("Stand::Cassa legno",(160,110,60),"legno")
layer("Stand::Cassa legno::Ruote",(40,40,40),"ruote")
layer("Stand::Sgabelli",(120,120,120),"sgabelli")
layer("Riferimenti::Prodotti",(0,160,0),"prodotti",False)
layer("Riferimenti::Figura umana",(150,150,150),"figura",False)
MAP={"Cartone bianco":"Stand::Pareti cartone","Loghi":"Stand::Pannelli logo","Cassa":"Stand::Cassa legno",
 "Cassa::Ruote":"Stand::Cassa legno::Ruote","Sgabelli":"Stand::Sgabelli","Default":"Riferimenti::Prodotti","Layer 01":"Riferimenti::Figura umana"}
n=0
for o in src.Objects:
    g=o.Geometry; L=src.Layers[o.Attributes.LayerIndex].FullPath
    try: b=g.GetBoundingBox()
    except: continue
    if not 32000<(b.Min.X+b.Max.X)/2<36500: continue
    if L=="Cartone stampato (colore modificabile)":
        tgt="Stand::Nicchie colore" if isinstance(g,r.Extrusion) else "Stand::Grafica banco laterale"
    else: tgt=MAP.get(L)
    if not tgt: continue
    g2=g.Duplicate(); g2.Translate(r.Vector3d(-OX,-OY,0))
    a=r.ObjectAttributes(); a.LayerIndex=LI[tgt]; a.Name=o.Attributes.Name or ""
    a.MaterialSource=r.ObjectMaterialSource.MaterialFromLayer
    if tgt.startswith("Riferimenti"): a.Visible=False
    out.Objects.Add(g2,a); n+=1
print("objs",n); print(out.Write("Stand_cartone_pulito.3dm",7))
