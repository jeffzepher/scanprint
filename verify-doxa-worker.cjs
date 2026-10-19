/* Worker startup contract test: real JS/WASM, HTTP fetch and /scanprint/ base. */
const fs=require('node:fs'),vm=require('node:vm'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const server=http.createServer((request,response)=>{
  if(request.url!=='/scanprint/vendor/doxa/doxaWasm.wasm'){response.writeHead(404);response.end();return}
  response.writeHead(200,{'Content-Type':'application/wasm'});response.end(fs.readFileSync('vendor/doxa/doxaWasm.wasm'));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url=`http://127.0.0.1:${server.address().port}/scanprint/scan-worker.js?v=25`,messages=[];
  const c={URL,WebAssembly,fetch,console,performance,setTimeout,clearTimeout,WorkerGlobalScope:class{},location:{href:url},postMessage:m=>messages.push(m)};
  c.self=c;vm.createContext(c);
  c.importScripts=(...urls)=>{for(const item of urls){const pathname=new URL(item,url).pathname;assert.ok(pathname.startsWith('/scanprint/'));vm.runInContext(fs.readFileSync(pathname.slice('/scanprint/'.length),'utf8'),c,{filename:pathname})}};
  vm.runInContext(fs.readFileSync('scan-worker.js','utf8'),c);
  const w=96,h=96,data=new Uint8ClampedArray(w*h*4).fill(255);
  for(let y=25;y<28;y++)for(let x=20;x<75;x++){const p=(y*w+x)*4;data[p]=data[p+1]=data[p+2]=90}
  const timer=setTimeout(()=>{throw Error('worker WASM initialization timed out')},20000);
  try{await c.onmessage({data:{id:1,task:'enhance',w,h,options:{mode:'text'},buffer:data.buffer}})}finally{clearTimeout(timer)}
  assert.equal(messages.length,1);assert.equal(messages[0].error,undefined);assert.equal(messages[0].id,1);
  const out=new Uint8ClampedArray(messages[0].buffer);assert.ok(out[(26*w+40)*4]<25);assert.equal(out[(80*w+40)*4],255);
  // Cache entries must contain all dependencies and match the visible version.
  const sw=fs.readFileSync('sw.js','utf8'),list=sw.match(/const FILES=(\[[^;]+\])/)[1];
  const files=vm.runInNewContext(list);for(const file of files){const local=file==='./'?'index.html':file.replace(/^\.\//,'').split('?')[0];assert.ok(fs.existsSync(local),'missing offline asset '+file)}
  assert.ok(files.includes('./doxa-engine.js?v=25'));assert.ok(files.includes('./vendor/doxa/doxaWasm.js'));assert.ok(files.includes('./vendor/doxa/doxaWasm.wasm'));
  assert.ok(fs.readFileSync('index.html','utf8').includes('<small>v25</small>'));
  console.log('PASS: worker-mode initialization, actual WASM HTTP fetch, GitHub Pages subpath, image enhancement and complete offline dependency list');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
