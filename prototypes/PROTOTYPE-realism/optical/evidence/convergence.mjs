import {frozenScene,seededRandom,traceSample} from '../transport.mjs';
import {writeFileSync} from 'node:fs';
const probes=[[0,0,-18],[-1,1,-18],[1,-1,-18]].map(origin=>{
 const scene=frozenScene(),rng=seededRandom(98),samples=Array.from({length:16384},()=>traceSample(origin,[0,0,1],scene,rng));
 const mean=n=>[0,1,2].map(j=>samples.slice(0,n).reduce((s,v)=>s+v[j]/n,0)),a=mean(8192),b=mean(16384);
 return {origin,first8192:a,all16384:b,maxMeanChange:Math.max(...a.map((v,j)=>Math.abs(v-b[j]))),standardError:[0,1,2].map(j=>Math.sqrt(samples.reduce((s,v)=>s+(v[j]-b[j])**2,0)/(16383*16384)))};
});
const result={seed:98,samples:16384,maxDepth:24,method:'Three fixed radiance probes, stochastic Fresnel paths. Does not prove whole-image or depth convergence.',probes};
writeFileSync(new URL('convergence.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
