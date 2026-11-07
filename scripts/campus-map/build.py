"""Build the north-up campus maps (ja/en) from the university's official map.
  curl -sLo map.pdf https://www.saitama-u.ac.jp/access/map.pdf
  pdftocairo -svg map.pdf map.svg
  python3 scripts/campus-map/build.py map.svg site-public/images"""
import sys,re
src,outdir=sys.argv[1:3]
# Read every path of the official map with its fill, stroke and bounding box (page coordinates).
P=[]
s=open(src).read()
for m in re.finditer(r'<path ([^>]*)/>',s[s.index('</defs>'):]):
    g=lambda k:(re.search(k+r'="([^"]*)"',m.group(1)) or [None,None])[1]
    d,tr=g('d'),g('transform')
    M=[float(v) for v in re.findall(r'-?[0-9.]+',tr)] if tr else [1,0,0,1,0,0]
    v=[float(x) for x in re.findall(r'-?[0-9.]+',d)]
    pts=[(M[0]*x+M[2]*y+M[4],M[1]*x+M[3]*y+M[5]) for x,y in zip(v[0::2],v[1::2])]
    P.append(dict(i=len(P),fill=g('fill'),stroke=g('stroke'),sw=g('stroke-width'),tr=tr,d=d,
                  bbox=[min(p[0] for p in pts),min(p[1] for p in pts),max(p[0] for p in pts),max(p[1] for p in pts)]))
K=1.49; OX=20+K*560; OY=20+K*619          # north-up: rotate the south-up official map by 180 degrees
X=lambda x:OX-K*x; Y=lambda y:OY-K*y
# Centres of the numbered buildings, in the official map's coordinates (from the previous traced map).
old=[(14,551,966.5),(13,663.5,966.5),(12,600.5,1003),(11,562,1025.5),(10,666.5,1045.5),(9,570.5,1072),(8,482.5,1061),(5,670.5,1117.5),(6,581,1110),(7,531.5,1130),(3,653,1161),(2,687,1218),(1,599.5,1224.5)]
num={n:((cx+11.2)/2.18,(cy+19.6)/2.18) for n,cx,cy in old}
def inside(b,pt,t=3): return b[0]-t<=pt[0]<=b[2]+t and b[1]-t<=pt[1]<=b[3]+t
def attrs(p):
    a=f'd="{p["d"]}"'
    if p['tr']: a+=f' transform="{p["tr"]}"'
    return a
bld=[p for p in P if p['stroke'] and p['fill'] not in (None,'none') and p['tr'] and p['sw'] and float(p['sw'])>0.4 and p['bbox'][0]>150 and p['bbox'][1]>100 and p['i']<200]
roads=[p for p in P if p['i']<67 and p['fill'] and p['fill'].startswith('rgb(86.27')]
base=P[0]
fieldlines=[p for p in P if p['fill']=='none' and p['stroke'] and p['stroke'].startswith('rgb(0%, 58.03') and p['i']<200]
track=[p for p in P if p['i']==165]
area=lambda p:(p['bbox'][2]-p['bbox'][0])*(p['bbox'][3]-p['bbox'][1])
# each number goes to the smallest building shape around its centre
owner={n:min((p for p in bld if inside(p['bbox'],c)),key=area)['i'] for n,c in num.items()}
def numbered(p): return [n for n,i in owner.items() if i==p['i']]
def svg(lang,labels,gate,road,note):
    o=[f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 830">','<rect width="900" height="830" fill="#fff"/>',
       '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 1L6 4L0 7" fill="none" stroke="#555"/></marker></defs>',
       f'<g transform="matrix(-{K} 0 0 -{K} {OX:.1f} {OY:.1f})">',
       f'<path fill="#f6f6f4" {attrs(base)}/>']
    o+= [f'<path fill="#e6e6e3" {attrs(p)}/>' for p in roads]
    o+= [f'<path fill="#ecece9" {attrs(p)}/>' for p in track]
    o+= [f'<path fill="none" stroke="#d2d2ce" stroke-width=".5" {attrs(p)}/>' for p in fieldlines]
    for p in bld:
        n=numbered(p)
        if 11 in n: style='fill="#171717" stroke="#171717"'
        elif n: style='fill="#d4d5d1" stroke="#9e9e9a"'
        else: style='fill="#ebebe8" stroke="#c9c9c5"'
        o.append(f'<path {style} stroke-width=".45" {attrs(p)}/>')
    o.append('</g>')
    o.append('<g font-family="Arial, Hiragino Kaku Gothic ProN, sans-serif" fill="#171717">')
    for n,(x,y) in num.items():
        if n==11: o.append(f'<text x="{X(x):.1f}" y="{Y(y)+6:.1f}" text-anchor="middle" font-size="17" font-weight="600" fill="#fff">11</text>')
        else: o.append(f'<text x="{X(x):.1f}" y="{Y(y)+4.5:.1f}" text-anchor="middle" font-size="13" fill="#333">{n}</text>')
    gx,gy=X(347.7),Y(588.4)
    o.append(f'<path d="M{gx-6:.1f} {gy-10:.1f}h12l-6 10z" fill="#171717"/>')
    o.append(f'<text x="{gx+12:.1f}" y="{gy-1:.1f}" font-size="15">{gate}</text>')
    # on the centre line of Route 463 (from (119,178) to (314,96) in map coordinates)
    o.append(f'<text x="217" y="137" dy=".35em" text-anchor="middle" font-size="14" fill="#555" transform="rotate(-22.9 217 137)">{road}</text>')
    o.append('<text x="560" y="58" text-anchor="middle" font-size="17">N</text><path d="M560 98V68" fill="none" stroke="#555" stroke-width="2" marker-end="url(#arrow)"/>')
    top=58
    for k,(n,label) in enumerate(labels):
        style=' font-size="20" font-weight="600"' if n==11 else ' font-size="17"'
        o.append(f'<text x="620" y="{top+k*36}"{style}>{n}  {label}</text>')
    o.append(f'<text x="620" y="{top+len(labels)*36+12}" font-size="13" fill="#626262">{note}</text>')
    o.append('</g></svg>')
    return '\n'.join(o)+'\n'
ja=[(1,'事務局棟'),(2,'守衛所'),(3,'研究機構棟'),(5,'教養学部棟'),(6,'全学講義棟3号館'),(7,'全学講義棟2号館'),(8,'サイエンスフロンティア'),(9,'教育機構棟'),(10,'全学講義棟1号館'),(11,'理学部3号館'),(12,'理学部講義実験棟'),(13,'理学部2号館'),(14,'理学部1号館')]
en=[(1,'Administration'),(2,'Gatehouse'),(3,'Research Building'),(5,'Liberal Arts'),(6,'Lecture Building 3'),(7,'Lecture Building 2'),(8,'Science Frontier'),(9,'Education Support'),(10,'Lecture Building 1'),(11,'Science Building 3'),(12,'Science Lecture / Lab'),(13,'Science Building 2'),(14,'Science Building 1')]
open(f'{outdir}/campus-science-map.svg','w').write(svg('ja',ja,'正門','国道463号線','縮尺は省略しています'))
open(f'{outdir}/campus-science-map-en.svg','w').write(svg('en',en,'Main gate','Route 463','Not to scale'))
