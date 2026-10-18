const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const handlers={},items=new Map([['./index.html',new Response('offline')],['https://example.test/style.css?v=9',new Response('cached-style')]]);let online=true,fetches=0;
 const key=r=>typeof r==='string'?r:r.url;
 const context={URL,Response,self:{location:{origin:'https://example.test'},addEventListener:(n,f)=>handlers[n]=f},caches:{match:async r=>items.get(key(r))?.clone(),open:async()=>({put:async(r,v)=>items.set(key(r),v),addAll:async()=>{}})},fetch:async()=>{fetches++;if(!online)throw Error('offline');return new Response('latest')}};
 vm.runInNewContext(fs.readFileSync('sw.js','utf8'),context);
 async function run(mode,path,cache='default'){let response;handlers.fetch({request:{method:'GET',url:'https://example.test/'+path,mode,cache},respondWith:p=>response=p});return (await response).text()}
 assert.equal(await run('navigate',''),'latest');assert.equal(await items.get('./index.html').clone().text(),'latest');online=false;assert.equal(await run('navigate',''),'latest');online=true;const before=fetches;assert.equal(await run('cors','style.css?v=9'),'cached-style');assert.equal(fetches,before);assert.equal(await run('cors','style.css?v=9','no-store'),'latest');
 const html=fs.readFileSync('index.html','utf8');for(const id of ['flatten','shadow','brightness','newDoc'])assert.ok(!html.includes('id="'+id+'"'));assert.ok(html.indexOf('history-section')<html.indexOf('id="workspace"'));assert.ok(html.includes('id="refreshApp"'));assert.ok(html.includes('max="14"'));
 console.log('PASS: navigation uses latest network page, offline fallback, asset cache, explicit refresh bypass, removed controls and visible history placement');
})().catch(e=>{console.error(e);process.exitCode=1});
