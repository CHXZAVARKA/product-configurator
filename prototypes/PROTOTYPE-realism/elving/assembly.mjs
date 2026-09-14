// Derive ordering from ALL relevant original assembly parts, not elving alone.
export function assemblyOrientationFromCAD(cad) {
 const names=['glazok','prizma','steklo','nasipka','elving'],partZRangesMm={};
 for(const name of names){const p=cad[name]?.positions;if(!p?.length)throw Error(`Missing original assembly ${name}`);let min=Infinity,max=-Infinity;for(let i=2;i<p.length;i+=3){min=Math.min(min,p[i]);max=Math.max(max,p[i]);}partZRangesMm[name]=[min,max];}
 const expected={glazok:[195,208],prizma:[12,192],steklo:[192,195],nasipka:[10,12],elving:[-17.653710126876838,-.5]};
 for(const name of names)for(let i=0;i<2;i++)if(Math.abs(partZRangesMm[name][i]-expected[name][i])>1e-4)throw Error(`Unexpected ${name} z boundary, re-audit assembly orientation`);
 if(!(partZRangesMm.glazok[0]>=partZRangesMm.steklo[1]-1e-4&&partZRangesMm.steklo[0]>=partZRangesMm.prizma[1]-1e-4&&partZRangesMm.prizma[0]>=partZRangesMm.nasipka[1]-1e-4&&partZRangesMm.nasipka[0]>partZRangesMm.elving[1]))throw Error('Invalid assembly optical ordering');
 return {partZRangesMm,eyeSide:'+Z',rayDirection:[0,0,-1],chipSpaceZMm:[partZRangesMm.elving[1],partZRangesMm.nasipka[0]],opticalOrder:['glazok','steklo','prizma','nasipka','free-shards','elving','backlight-negative-Z']};
}
