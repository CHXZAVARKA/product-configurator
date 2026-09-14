import { volumeMm3 } from '../geometry.mjs';

// Broad fragments of a broken sheet, not radial rings around a gemstone girdle.
// Each contour is an intersection of vertical halfspaces with two fracture planes.
// This keeps the rendered solid and the Rapier hull identical and convex.
const contours = [
 [[-1,-.75],[1,-.58],[.12,1]],
 [[-1,-.73],[.94,-.85],[.8,.86],[-.76,1]],
 [[-1,-.6],[.8,-1],[1,.66],[-.85,.78]],
 [[-1,-.85],[.88,-.75],[1,.45],[.51,1],[-.88,.88]],
 [[-1,-.7],[.45,-1],[1,-.5],[.82,.95],[-.92,.77]],
 [[-1,-.82],[.79,-.89],[1,-.3],[.87,.81],[-.55,1],[-1,.5]],
];
const colors = [[.025,.57,.66],[.67,.035,.43],[.025,.12,.58],[.94,.29,.018],[.30,.085,.48],[.035,.48,.08],[.63,.78,.76],[.76,.66,.63],[.71,.74,.81],[.62,.47,.65],[.70,.13,.18],[.91,.61,.035]];
const cross2 = (a,b,c) => (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
const distance2 = (a,b) => (a[0]-b[0])**2+(a[1]-b[1])**2;

// A short clipped corner must not make the broad-face fan needle-shaped.
// Enumerate the few polygon triangulations and keep the best worst triangle.
function triangulate(contour, first=0, last=contour.length-1) {
 if(last-first<2)return {score:0,triangles:[]};
 let best={score:Infinity,triangles:[]};
 for(let middle=first+1;middle<last;middle++) {
  const a=contour[first],b=contour[middle],c=contour[last];
  const score=Math.max(distance2(a,b),distance2(b,c),distance2(c,a))/cross2(a,b,c);
  const left=triangulate(contour,first,middle),right=triangulate(contour,middle,last);
  const worst=Math.max(score,left.score,right.score);
  if(worst<best.score)best={score:worst,triangles:[...left.triangles,...right.triangles,[first,middle,last]]};
 }
 return best;
}

export function makeBrokenChip(id, random, thin=false) {
 const choice=random();
 const family=choice<.12?0:choice<.39?1:choice<.66?2:choice<.81?3:choice<.94?4:5;
 const template=contours[family], stretch=.72+random()*.28, skew=(random()-.5)*.26;
 let contour;
 // Small independent fracture variation, rejecting any reflex corner.
 for(let attempt=0;attempt<12;attempt++) {
  contour=template.map(([x,y])=>[x+(random()-.5)*.18+skew*y,(y+(random()-.5)*.18)*stretch]);
  if(contour.every((a,i)=>cross2(a,contour[(i+1)%contour.length],contour[(i+2)%contour.length])>.10))break;
  contour=null;
 }
 if(!contour)contour=template.map(([x,y])=>[x+skew*y,y*stretch]);
 const center=[0,1].map(k=>contour.reduce((sum,p)=>sum+p[k],0)/contour.length);
 contour=contour.map(p=>p.map((v,k)=>v-center[k]));
 // Most fragments remain large enough to retain the loose-glass fill; occasional
 // smaller splinters add the size spread visible in the user's photograph.
 const size=random(), radius=size<.09?1.95+random()*.35:2.68+random()*.12;
 const scale=radius/Math.max(...contour.map(p=>Math.hypot(...p)));
 contour=contour.map(p=>p.map(v=>v*scale));
 const n=contour.length, limit=thin?.9:1.10;
 const nominal=thin?1.60+random()*.15:1.94+random()*.17;
 const angle=random()*Math.PI*2, wedge=.015+random()*.07, common=(random()-.5)*.035;
 const gradient=[Math.cos(angle)*wedge,Math.sin(angle)*wedge];
 let vertices=[...contour.map(([x,y])=>[x,y,-nominal/2+common*x]),...contour.map(([x,y])=>[x,y,nominal/2+common*x+gradient[0]*x+gradient[1]*y])];
 const minZ=Math.min(...vertices.map(p=>p[2])),maxZ=Math.max(...vertices.map(p=>p[2]));
 const zCenter=(minZ+maxZ)/2,zScale=Math.min(1,(2*limit-.005)/(maxZ-minZ));
 vertices=vertices.map(([x,y,z])=>[x,y,(z-zCenter)*zScale]);
 const indices=[];
 for(const [a,b,c] of triangulate(contour).triangles)indices.push(a,c,b,n+a,n+b,n+c);
 for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+j,i,n+j,n+i);}
 const thicknessMm=(maxZ-minZ)*zScale;
 const color=colors[(id+Math.floor(random()*colors.length))%colors.length].map(v=>Math.min(1,v*(.92+random()*.16)));
 return {id,vertices,indices,color,thicknessMm,volumeMm3:volumeMm3(vertices,indices),provenance:'Procedural broken-sheet glass hypothesis guided by the user photograph: asymmetric sharp triangular, quadrilateral and corner-chipped convex fragments with sloping fracture planes; dimensions and palette are not measured STEP parts.'};
}
