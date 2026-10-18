const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
function extract(name){const start=source.indexOf(`function ${name}(`);let depth=0,opened=false;for(let i=source.indexOf('{',start);i<source.length;i++){if(source[i]==='{'){depth++;opened=true}if(source[i]==='}'&&!--depth&&opened)return source.slice(start,i+1)}throw Error(name)}
// These math functions contain no string braces, so extraction is intentionally limited to them.
const context={Math,Error};vm.createContext(context);for(const name of ['solve','area','validQuad'])vm.runInContext(extract(name),context);
assert.deepEqual(Array.from(context.solve([[2,1],[1,-1]],[5,1])),[2,1]);
assert.equal(context.area([[0,0],[100,0],[100,200],[0,200]]),20000);
assert.equal(context.validQuad([[0,0],[100,0],[100,200],[0,200]]),true);
assert.equal(context.validQuad([[0,0],[100,200],[100,0],[0,200]]),false);
const pdfSource=source.slice(source.indexOf('function makePDF('),source.indexOf("$('export').onclick"));
Object.assign(context,{TextEncoder,Blob,Uint8Array});vm.runInContext(pdfSource,context);
(async()=>{const pdf=await context.makePDF([{w:100,h:200,bytes:new Uint8Array([255,216,255,217])},{w:200,h:100,bytes:new Uint8Array([255,216,255,217])}],'a4').text();assert.match(pdf,/\/Count 2/);assert.match(pdf,/595\.280 841\.890/);assert.match(pdf,/841\.890 595\.280/);const xref=Number(pdf.match(/startxref\n(\d+)/)[1]);assert.equal(pdf.slice(xref,xref+4),'xref');const lines=pdf.slice(xref).split('\n');for(let i=1;i<=8;i++){const offset=Number(lines[i+2].slice(0,10));assert.equal(pdf.slice(offset,offset+`${i} 0 obj`.length),`${i} 0 obj`)}const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest'));for(const icon of manifest.icons)assert.ok(fs.existsSync(icon.src));if(process.argv.includes('--http'))for(const asset of ['index.html','style.css','app.js','sw.js',...manifest.icons.map(i=>i.src)]){const r=await fetch('http://127.0.0.1:5173/'+asset.replace('./',''));assert.equal(r.status,200,asset)}console.log('PASS: crop geometry, linear solve, multipage PDF offsets and orientations, manifest icons (HTTP resources only with --http)');})().catch(e=>{console.error(e);process.exitCode=1});


