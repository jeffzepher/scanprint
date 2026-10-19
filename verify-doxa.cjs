const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function load(){
 const m={exports:{}};
 new Function('module','exports','require','__dirname','__filename',fs.readFileSync('vendor/doxa/doxaWasm.js','utf8'))(m,m.exports,require,path.resolve('vendor/doxa'),path.resolve('vendor/doxa/doxaWasm.js'));
 const wasm=m.exports;
 if(!wasm.Binarization)await new Promise((resolve,reject)=>{wasm.onRuntimeInitialized=resolve;wasm.onAbort=reject});
 const c={};new Function('globalThis',fs.readFileSync('doxa-engine.js','utf8'))(c);c.DoxaEngine.bind(wasm);
 new Function('globalThis',fs.readFileSync('processing-core.js','utf8'))(c);
 return {c,wasm};
}
module.exports={load};
if(require.main===module)(async()=>{
 const {c,wasm}=await load(),w=1051,h=603,gray=new Uint8Array(w*h);let seed=7;
 for(let i=0;i<gray.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;gray[i]=60+(seed>>>24)*.75}
 const parameters=c.ScanCore.textParameters(w,h),input=wasm._malloc(gray.length),output=wasm._malloc(gray.length);
 let algorithm,expected;
 try{wasm.HEAPU8.set(gray,input);algorithm=new wasm.Binarization(wasm.Binarization.Algorithms.SAUVOLA);algorithm.initialize(input,w,h);algorithm.toBinary(output,JSON.stringify(parameters));expected=wasm.HEAPU8.slice(output,output+gray.length)}
 finally{algorithm?.delete();wasm._free(input);wasm._free(output)}
 assert.deepEqual(c.DoxaEngine.binary(gray,w,h,parameters),expected,'halo tiles must match full Doxa output including every seam and paper edge');
 const plane=new Uint8Array(512*512).fill(245);for(let i=0;i<plane.length;i+=17)plane[i]=65;
 for(let i=0;i<3;i++)c.DoxaEngine.binary(plane,512,512,{window:41,k:.24});
 const warmHeap=wasm.HEAPU8.buffer.byteLength;
 for(let i=0;i<36;i++)c.DoxaEngine.binary(plane,512,512,{window:41,k:.24});
 assert.equal(wasm.HEAPU8.buffer.byteLength,warmHeap,'repeated batch processing must release WASM buffers and algorithm instances');
 const fw=360,fh=280,data=new Uint8ClampedArray(fw*fh*4).fill(255);
 const pixel=(x,y,v)=>{const p=(y*fw+x)*4;data[p]=data[p+1]=data[p+2]=v};
 for(let y=30;y<70;y+=13)for(let x=20;x<155;x++)if(x%11<5)pixel(x,y,190);
 for(let x=20;x<155;x++)pixel(x,180,240);
 for(let y=240;y<245;y++)for(let x=20;x<155;x++)pixel(x,y,y===240||y===244?150:35);
 for(let y=95;y<220;y++)for(let x=190;x<330;x++)pixel(x,y,50+Math.round(160*(x-190)/140)+Math.round(5*Math.sin(y)));
 const enhanced=c.ScanCore.enhance(data,fw,fh,{mode:'text'}),at=(a,x,y)=>a[(y*fw+x)*4];
 assert.ok(at(enhanced,22,30)<170,'faint front-side print remains legible');
 assert.ok(at(enhanced,80,180)>245,'weak reverse-side print is removed');
 assert.equal(at(enhanced,160,250),255,'paper remains white');
 assert.ok(at(enhanced,80,240)>20,'subpixel stroke edges keep gray coverage');assert.ok(at(enhanced,80,242)<50,'stroke cores remain dark');
 const tones=new Set();for(let x=215;x<305;x++)tones.add(at(enhanced,x,150));
 assert.ok(tones.size>40,'mixed mode retains continuous picture tones instead of binarizing every illustration');
 const bw=c.ScanCore.enhance(data,fw,fh,{mode:'bw'});assert.ok(bw.every((v,i)=>i%4===3||v===0||v===255),'black-white mode stays strictly binary');
 assert.deepEqual(c.ScanCore.enhance(data,fw,fh,{mode:'original'}),data,'original mode remains unchanged');
 const saver=c.ScanCore.enhance(data,fw,fh,{mode:'text',inkSaver:true});assert.ok(at(saver,22,30)>at(enhanced,22,30),'ink saver remains effective');
 // Exercise the actual worker message handler with the initialized real WASM.
 c.self=c;c.importScripts=()=>{};c.DoxaEngine.initialize=async()=>c.DoxaEngine;
 c.postMessage=m=>{c.message=m};
 new Function('self','importScripts','ScanCore','DoxaEngine',fs.readFileSync('scan-worker.js','utf8'))(c,c.importScripts,c.ScanCore,c.DoxaEngine);
 await c.onmessage({data:{id:9,task:'enhance',w:fw,h:fh,options:{mode:'text'},buffer:data.buffer.slice(0)}});
 assert.equal(c.message.id,9);assert.equal(c.message.error,undefined);assert.deepEqual(new Uint8ClampedArray(c.message.buffer),enhanced,'single/batch worker path uses the tested Doxa pipeline');
 console.log('PASS: real Doxa WASM, exact halo seams, bounded batch heap, faint print, bleed-through, mixed illustration tones, black/white, original, ink saver and worker integration');
})().catch(error=>{console.error(error);process.exitCode=1});
