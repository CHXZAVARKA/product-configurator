// Geometric local-normal chord through the convex envelope. This is a static
// thickness approximation, not a refracted ray path through every visual scoop.
export function vertexThickness(chip, surface) {
 const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const planes=[];
 for(let i=0;i<chip.indices.length;i+=3){const [a,b,c]=chip.indices.slice(i,i+3).map(j=>chip.vertices[j]),n=cross(sub(b,a),sub(c,a)),length=Math.hypot(...n);planes.push({n:n.map(v=>v/length),p:a});}
 const normals=surface.vertices.map(()=>[0,0,0]);
 for(let i=0;i<surface.indices.length;i+=3){const ids=surface.indices.slice(i,i+3),[a,b,c]=ids.map(j=>surface.vertices[j]),n=cross(sub(b,a),sub(c,a));for(const id of ids)for(let k=0;k<3;k++)normals[id][k]+=n[k];}
 return surface.vertices.map((position,i)=>{
  const length=Math.hypot(...normals[i]),direction=normals[i].map(v=>-v/length);
  let exit=Infinity;
  for(const plane of planes){const denominator=dot(plane.n,direction);if(denominator>1e-8)exit=Math.min(exit,Math.max(0,dot(plane.n,sub(plane.p,position)))/denominator);}
  return Math.max(.04,Number.isFinite(exit)?exit:chip.thicknessMm);
 });
}
