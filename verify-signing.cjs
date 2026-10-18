const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function load(file){const m={exports:{}};new Function('module','exports','require','__dirname','__filename',fs.readFileSync(file,'utf8'))(m,m.exports,require,path.dirname(path.resolve(file)),path.resolve(file));return m.exports}
const lib=load('vendor/pdf-lib.min.js'),pdfjs=load('vendor/pdf.min.js');
globalThis.pdfjsWorker=load('vendor/pdf.worker.min.js');
pdfjs.GlobalWorkerOptions.workerSrc=path.resolve('vendor/pdf.worker.min.js');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('signing-core.js','utf8'),context);
(async()=>{
 const doc=await lib.PDFDocument.create();for(const angle of [0,90,180,270]){const page=doc.addPage([400,600]);page.setRotation(lib.degrees(angle));page.drawText('Original content '+angle,{x:40,y:500,size:18})}
 const original=await doc.save(),preview=await pdfjs.getDocument({data:original.slice(),isEvalSupported:false}).promise;
 const png=await doc.embedPng('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=');
 for(let i=0;i<4;i++){
  const page=doc.getPage(i),p=await preview.getPage(i+1),view=p.getViewport({scale:1}),s=context.SigningCore.fitStamp({x:.2,y:.3,w:.25,ratio:.3},view.width/view.height),placement=context.SigningCore.pdfPlacement(s,view),angle=page.getRotation().angle*Math.PI/180;
  const corners=[[placement.x,placement.y],[placement.x+placement.width*Math.cos(angle),placement.y+placement.width*Math.sin(angle)],[placement.x-placement.height*Math.sin(angle),placement.y+placement.height*Math.cos(angle)]];
  const projected=corners.map(([x,y])=>view.convertToViewportPoint(x,y));assert.ok(Math.abs(projected[0][0]-.2*view.width)<.001);assert.ok(Math.abs(projected[0][1]-(s.y+s.h)*view.height)<.001);assert.ok(Math.abs(projected[1][0]-(s.x+s.w)*view.width)<.001);assert.ok(Math.abs(projected[2][1]-s.y*view.height)<.001);
  page.drawImage(png,{...placement,rotate:page.getRotation()});
 }
 const saved=await doc.save(),reopened=await lib.PDFDocument.load(saved);assert.equal(reopened.getPageCount(),4);
 const parsed=await pdfjs.getDocument({data:saved.slice(),isEvalSupported:false}).promise;for(let i=1;i<=4;i++){const text=await(await parsed.getPage(i)).getTextContent();assert.ok(text.items.some(t=>t.str.includes('Original content')),'preserve original PDF text')}
 for(const ratio of [.2,1,5]){const s=context.SigningCore.fitStamp({x:.99,y:.99,w:.8,ratio:2},ratio);assert.ok(s.x+s.w<=1.000001&&s.y+s.h<=1.000001,'keep stamp within page')}
 await parsed.destroy();await preview.destroy();console.log('PASS: PDF signing at 0/90/180/270 degrees, multipage preservation, original text preservation, signature boundary clamping');
})().catch(e=>{console.error(e);process.exitCode=1});

