const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
function commonJS(file){const m={exports:{}};new Function('module','exports','require','__dirname','__filename',fs.readFileSync(file,'utf8'))(m,m.exports,require,path.dirname(path.resolve(file)),path.resolve(file));return m.exports}
(async()=>{
  const loaded=commonJS('vendor/opencv.js');const {cv}=await new Promise(resolve=>{if(loaded.Mat)resolve({cv:loaded});else loaded.then(value=>resolve({cv:value}))});global.cv=cv;const jscanify=commonJS('vendor/jscanify.js');
  const context={console,Uint8ClampedArray,Float32Array,Int32Array,Math,Error,cv,jscanify,importScripts(){},postMessage(){}};context.self=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync('processing-core.js','utf8'),context);vm.runInContext(fs.readFileSync('scan-worker.js','utf8'),context);
  const dims=JSON.parse(fs.readFileSync('samples/dimensions.json'));
  const [fw,fh]=dims.full;
  const detected=await context.detect(new Uint8ClampedArray(fs.readFileSync('samples/full.rgba')),fw,fh);console.log('Actual photo detection:',JSON.stringify(detected));
  const [w,h]=dims.page,data=new Uint8ClampedArray(fs.readFileSync('samples/page.rgba'));
  for(const mode of ['text','bw','natural']){const start=Date.now(),out=context.ScanCore.enhance(data,w,h,{mode,strength:100});fs.writeFileSync('samples/'+mode+'.rgba',out);console.log(mode,Date.now()-start+'ms')}
})().catch(e=>{console.error(e);process.exitCode=1});
