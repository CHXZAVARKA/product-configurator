import {build} from 'esbuild';
await build({stdin:{contents:"export {WebGLPathTracer} from 'three-gpu-pathtracer';",resolveDir:import.meta.dirname},bundle:true,format:'esm',minify:true,plugins:[{name:'shared-three',setup(b){b.onResolve({filter:/^three$/},()=>({path:'three',external:true}));}}],outfile:new URL('../vendor/pathtracer.js',import.meta.url).pathname});
