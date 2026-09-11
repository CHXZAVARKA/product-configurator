// Read-only geometry audit, no solver stepping or application edits.
import {readFileSync,writeFileSync} from 'node:fs';
const source=readFileSync(new URL('../model.js',import.meta.url),'utf8').replace("'cannon-es'",JSON.stringify(new URL('../vendor/cannon-es.js',import.meta.url).href)).replace("'rapier'",JSON.stringify(new URL('../vendor/rapier.js',import.meta.url).href));
const {Filling,fracturedSurface}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const f=new Filling(),chamberVolume=Math.PI*18.8**2*10,r=.3,rows=[];
for(const [i,p] of f.pieces.entries()){
 let area=0,perimeter=0,diameter=0;
 for(let j=0;j<p.profile.length;j++){const a=p.profile[j],b=p.profile[(j+1)%p.profile.length];area+=(a[0]*b[1]-b[0]*a[1])/2;perimeter+=Math.hypot(a[0]-b[0],a[1]-b[1]);for(const b of p.profile)diameter=Math.max(diameter,Math.hypot(a[0]-b[0],a[1]-b[1]));}
 const h=p.h*2,prism=area*h,surface=2*area+perimeter*h;
 // Steiner formula for a convex prism offset by a sphere of radius r.
 const rounded=prism+surface*r+Math.PI*(h+perimeter/2)*r*r+4*Math.PI*r**3/3;
 const {positions:v,indices:t}=fracturedSurface(p,i);let rendered=0;
 for(let j=0;j<t.length;j+=3){const a=t[j]*3,b=t[j+1]*3,c=t[j+2]*3;rendered+=(v[a]*(v[b+1]*v[c+2]-v[b+2]*v[c+1])+v[a+1]*(v[b+2]*v[c]-v[b]*v[c+2])+v[a+2]*(v[b]*v[c+1]-v[b+1]*v[c]))/6;}
 rows.push({diameterMm:diameter,thicknessMm:h,prismMm3:prism,roundedMm3:rounded,renderedMm3:rendered,nativeVolumeMm3:p.rigid.collider(0).volume(),maxPointSpanMm:Math.hypot(diameter,h)+2*r});
}
const sum=k=>rows.reduce((s,r)=>s+r[k],0),range=k=>{const a=rows.map(r=>r[k]).sort((a,b)=>a-b);return{min:a[0],median:a[Math.floor(a.length/2)],max:a.at(-1)}};
let overlappingPairs=0,maximumInitialOverlapMm=0;
for(let i=0;i<f.pieces.length;i++)for(let j=i+1;j<f.pieces.length;j++){
 const contact=f.pieces[i].rigid.collider(0).contactCollider(f.pieces[j].rigid.collider(0),0);
 if(contact&&contact.distance<-.00001){overlappingPairs++;maximumInitialOverlapMm=Math.max(maximumInitialOverlapMm,-contact.distance);}
}
const result={commit:'45b1bd5',count:rows.length,initialRoundedContacts:{overlappingPairs,maximumInitialOverlapMm},chamberVolumeMm3:chamberVolume,planarDiameter:range('diameterMm'),thickness:range('thicknessMm'),roundedMaxPointSpan:range('maxPointSpanMm'),roundedSpansOver9Mm:rows.filter(r=>r.maxPointSpanMm>9).length,roundedSpansOver10Mm:rows.filter(r=>r.maxPointSpanMm>10).length,renderVolumeFraction:sum('renderedMm3')/chamberVolume,prismVolumeFraction:sum('prismMm3')/chamberVolume,roundedGeometricVolumeFraction:sum('roundedMm3')/chamberVolume,nativeReportedVolumeFraction:sum('nativeVolumeMm3')/chamberVolume,roundedToRenderedVolumeRatio:sum('roundedMm3')/sum('renderedMm3'),notes:['Sum of individual solid volumes, not a union, jam threshold or spatial free-path measurement.','Rounded geometric volume uses a convex-prism Minkowski offset formula; native volume may use a different mass-property approximation.','Max point span over chamber depth restricts some orientations; it does not prove that a piece cannot move.']};
f.dispose();console.log(JSON.stringify(result,null,2));writeFileSync(new URL('./realism-audit.json',import.meta.url),JSON.stringify(result,null,2));
