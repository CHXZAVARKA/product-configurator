// Eye and chamber share a frame. A roll/tilt rotates that frame in the world;
// HDRI lookup and reflected light use the same inverse environment rotation.
// Column-major matrices, radians internally. No translation for a distant HDRI.
const multiply=(a,b)=>Array.from({length:9},(_,i)=>{const r=i%3,c=Math.floor(i/3);return a[r]*b[c*3]+a[r+3]*b[c*3+1]+a[r+6]*b[c*3+2];});
export const transposeRotation=m=>[m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]];
export const rotateVector=(m,v)=>[0,1,2].map(r=>m[r]*v[0]+m[r+3]*v[1]+m[r+6]*v[2]);
export function viewOrientation(rollDeg=0,tiltDeg=0,hdriYawDeg=0){
 const [r,t,h]=[rollDeg,tiltDeg,hdriYawDeg].map(v=>v*Math.PI/180);
 const rx=[1,0,0,0,Math.cos(t),Math.sin(t),0,-Math.sin(t),Math.cos(t)];
 const rz=[Math.cos(r),Math.sin(r),0,-Math.sin(r),Math.cos(r),0,0,0,1];
 const ry=[Math.cos(h),0,-Math.sin(h),0,1,0,Math.sin(h),0,Math.cos(h)];
 const worldToView=multiply(rz,rx),environmentToView=multiply(worldToView,ry);
 return {worldToView,viewToWorld:transposeRotation(worldToView),environmentToView,viewToEnvironment:transposeRotation(environmentToView)};
}
