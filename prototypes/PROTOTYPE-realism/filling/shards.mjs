import {volumeMm3} from '../geometry.mjs';
export const ASSUMPTION='Процедурные осколки 4–6,5 мм, толщина 1,3–2,1 мм, плотность 2500 кг/м³: предположение до измерения реальной навески.';
export const LEVELS=Object.freeze({loose:.06,medium:.12,dense:.18});
export function random(seed){let a=seed>>>0;return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function shard(id,rng){
 const n=[3,4,5,6,7][id%5],radius=2+rng()*1.25,aspect=.7+rng()*.3,t=1.3+rng()*.8,phase=rng()*6.28;
 const contour=Array.from({length:n},(_,i)=>{const a=phase+i*2*Math.PI/n;return [Math.cos(a)*radius,Math.sin(a)*radius*aspect];});
 const vertices=[...contour.map(([x,y])=>[x,y,-t/2]),...contour.map(([x,y])=>[x*.9,y*.9,t/2])],indices=[];
 for(let i=1;i<n-1;i++)indices.push(0,i+1,i,n,n+i,n+i+1);
 for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+j,i,n+j,n+i);}
 return {id,kind:['triangle','quadrilateral','pentagon','hexagon','heptagon'][id%5],vertices,indices,thicknessMm:t,color:['#9bcac2','#d9adce','#dfb164','#779fc7','#95b583'][id%5],provenance:ASSUMPTION,borderRadiusMm:0,volumeMm3:volumeMm3(vertices,indices)};
}
export function quaternion(rng){const u=rng(),a=rng()*2*Math.PI,b=rng()*2*Math.PI;return [Math.sqrt(1-u)*Math.sin(a),Math.sqrt(1-u)*Math.cos(a),Math.sqrt(u)*Math.sin(b),Math.sqrt(u)*Math.cos(b)];}
