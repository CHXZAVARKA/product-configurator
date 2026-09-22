import {transformVertices} from '../geometry.mjs';
import {cadContainment} from './containment.mjs';
// Reproducible cell-centre sampling of actual CAD-accessible space in the nominal cylinder.
// The estimate is explicit; exact hull volumes remain the displayed volume contract.
export function sampleFreeSpace(chamber,chips,poses,spacingMm=1){
 const contains=cadContainment(chamber),solids=chips.map((chip,i)=>{const vs=transformVertices(chip,poses[i]),centre=[0,1,2].map(k=>vs.reduce((s,p)=>s+p[k],0)/vs.length),planes=[];
  for(let j=0;j<chip.indices.length;j+=3){const [a,b,c]=chip.indices.slice(j,j+3).map(k=>vs[k]),u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],dot=p=>p.reduce((s,x,k)=>s+n[k]*(x-a[k]),0);if(dot(centre)>0)for(let k=0;k<3;k++)n[k]*=-1;planes.push({a,n});}
  return {bounds:[0,1,2].map(k=>[Math.min(...vs.map(p=>p[k])),Math.max(...vs.map(p=>p[k]))]),planes};});
 let nominalCells=0,cadBlockedCells=0,occupiedCells=0;const inside=(p,s)=>s.bounds.every(([a,b],k)=>p[k]>=a&&p[k]<=b)&&s.planes.every(({a,n})=>p.reduce((d,x,k)=>d+n[k]*(x-a[k]),0)<=1e-6);
 for(let x=-chamber.radiusMm+spacingMm/2;x<chamber.radiusMm;x+=spacingMm)for(let y=-chamber.radiusMm+spacingMm/2;y<chamber.radiusMm;y+=spacingMm){if(Math.hypot(x,y)>chamber.radiusMm)continue;for(let z=chamber.floorEnvelopeMm+spacingMm/2;z<chamber.ceilingMm;z+=spacingMm){nominalCells++;const p=[x,y,z];if(contains([p],[])>1e-5){cadBlockedCells++;continue;}if(solids.some(s=>inside(p,s)))occupiedCells++;}}
 const accessibleCells=nominalCells-cadBlockedCells;return {method:'1mm cell-centre grid, clipped to nominal cylinder, independently checked against CAD surfaces and closed shard halfspaces',spacingMm,nominalCells,cadBlockedCells,accessibleCells,occupiedCells,emptyAccessibleCells:accessibleCells-occupiedCells,freeAccessibleFraction:(accessibleCells-occupiedCells)/accessibleCells};
}
