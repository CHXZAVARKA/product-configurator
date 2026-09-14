// CAD inputs and all outward solid vertices are millimetres. No outer round radius.
export const BASE_SHA = '10ebf5f9eeaa6702811882f495b12b14d0611f49';
export const HYPOTHESIS = 'Свободных осколков нет в STEP. Контуры 6–8 мм, толщина 2–2,4 мм, плотность 2500 кг/м³: временное предположение, не измерение.';
export function chamberFromCAD(cad) {
 const required = ['trubka', 'nasipka', 'elving', 'krishka'];
 for (const name of required) if (!cad[name]?.positions || !cad[name]?.indices) throw Error(`Missing CAD ${name}`);
 const top = Math.max(...cad.elving.positions.filter((_,i)=>i%3===2));
 const ceiling = Math.min(...cad.nasipka.positions.filter((_,i)=>i%3===2));
 // Inner cylinder tessellation has radii 19 and 20 mm, independently checked STEP.
 const radii = cad.trubka.positions.filter((_,i)=>i%3===0).map((x,i)=>Math.hypot(x,cad.trubka.positions[i*3+1]));
 const radius = Math.min(...radii);
 if (Math.abs(radius-19)>.001 || Math.abs(top+.5)>.001 || Math.abs(ceiling-10)>.001) throw Error('Unexpected CAD units or boundary');
 return Object.freeze({radiusMm:radius, floorEnvelopeMm:top, ceilingMm:ceiling, nominalGapMm:ceiling-top, parts:required.map(name=>({name,...cad[name]})), note:'Реальные треугольники CAD ограничивают контакт. 10,5 мм, номинальный зазор по максимальному z эльвинга; местный зазор зависит от поверхности. Полная трубка не обрезается в физике.'});
}
export function makeChip(id=0) {
 const contour = id%2===0 ? [[-3.6,-1.4],[-1.1,-2.6],[2.7,-1.9],[3.5,.8],[.3,2.8],[-3.1,1.5]] : [[-2.7,-2.2],[1.2,-2.6],[3.1,-.3],[1.6,2.5],[-2.9,1.4]];
 const thicknessMm=id%2===0?2.4:2;
 const vertices = [...contour.map(([x,y])=>[x,y,-thicknessMm/2]),...contour.map(([x,y])=>[x*.94,y*.94,thicknessMm/2])];
 const n=contour.length, indices=[];
 for(let i=1;i<n-1;i++){indices.push(0,i+1,i);indices.push(n,n+i,n+i+1);}
 for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+j,i,n+j,n+i);}
 return Object.freeze({id, vertices, indices, thicknessMm, color:id%2===0?'#9bcac2':'#d9adce', provenance:HYPOTHESIS, borderRadiusMm:0});
}
export function volumeMm3(vertices,indices) {
 let v=0;for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3).map(j=>vertices[j]);v+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);}return Math.abs(v/6);
}
export function transformVertices(chip,pose) {
 const [x,y,z,w]=pose.rotation;return chip.vertices.map(v=>{const tx=2*(y*v[2]-z*v[1]),ty=2*(z*v[0]-x*v[2]),tz=2*(x*v[1]-y*v[0]);return [v[0]+w*tx+y*tz-z*ty+pose.positionMm[0],v[1]+w*ty+z*tx-x*tz+pose.positionMm[1],v[2]+w*tz+x*ty-y*tx+pose.positionMm[2]];});
}
