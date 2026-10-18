const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
(async()=>{
 const records=new Map(),stub=()=>({width:10,height:10,getContext:()=>({drawImage(){}}),toDataURL:()=> 'thumb'});
 const context={crypto,structuredClone,source:{kind:'pdf',name:'contract.pdf',bytes:new Uint8Array([1,2,3])},pdf:{numPages:2},pageCanvas:{width:10,height:10},pageNumber:1,stamps:[],historyId:'draft-1',exported:{blob:new Blob(['first export'],{type:'application/pdf'}),filename:'contract-已签字.pdf'},canvas:stub,image:async()=>({}),historyStore:{thumbnail:async()=> 'thumb',put:async r=>records.set(r.id,structuredClone(r))},note(){}};
 const code=fs.readFileSync('signature.js','utf8'),start=code.indexOf('async function saveHistory('),end=code.indexOf('window.saveSigningProgress',start);vm.createContext(context);vm.runInContext(code.slice(start,end),context);
 await context.saveHistory(true);const first=[...records.values()][0];assert.equal(first.type,'sign');assert.equal(first.name,'contract-已签字.pdf');assert.equal(await first.blob.text(),'first export');
 context.exported=null;await context.saveHistory();assert.equal(records.get('draft-1').type,'draft');assert.equal(await records.get(first.id).blob.text(),'first export');
 context.exported={blob:new Blob(['second export'],{type:'application/pdf'}),filename:'contract-已签字.pdf'};await context.saveHistory(true);const exports=[...records.values()].filter(r=>r.type==='sign');assert.equal(exports.length,2);assert.notEqual(exports[0].id,exports[1].id);assert.equal(await exports[1].blob.text(),'second export');
 records.delete(first.id);await context.saveHistory();assert.ok(!records.has(first.id));assert.equal([...records.values()].filter(r=>r.type==='sign').length,1);
 console.log('PASS: signed PDF snapshots preserve exported bytes, later edits do not overwrite exports, repeated exports get distinct history, deleted exports are not recreated by draft saves');
})().catch(e=>{console.error(e);process.exitCode=1});
