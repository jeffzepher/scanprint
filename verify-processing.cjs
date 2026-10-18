const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
function commonJS(file){const m={exports:{}};new Function('module','exports','require','__dirname','__filename',fs.readFileSync(file,'utf8'))(m,m.exports,require,path.dirname(path.resolve(file)),path.resolve(file));return m.exports}
(async()=>{
  const loaded=commonJS('vendor/opencv.js');const {cv}=await new Promise(resolve=>{if(loaded.Mat)resolve({cv:loaded});else loaded.then(value=>resolve({cv:value}))});global.cv=cv;const jscanify=commonJS('vendor/jscanify.js');
  const context={console,Uint8ClampedArray,Float32Array,Int32Array,Math,Error,cv,jscanify,importScripts(){},postMessage(){}};context.self=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync('processing-core.js','utf8'),context);vm.runInContext(fs.readFileSync('scan-worker.js','utf8'),context);
  const w=640,h=800,points=[[85,65],[555,105],[580,720],[60,750]],image=new cv.Mat(h,w,cv.CV_8UC4,new cv.Scalar(45,55,60,255));
  const polygon=cv.matFromArray(4,1,cv.CV_32SC2,points.flat());cv.fillConvexPoly(image,polygon,new cv.Scalar(230,230,225,255));
  for(let y=160;y<650;y+=35)cv.line(image,new cv.Point(140,y),new cv.Point(490,y),new cv.Scalar(40,40,40,255),3);
  const detected=await context.detect(new Uint8ClampedArray(image.data),w,h);assert.ok(detected,'detect perspective page');for(let i=0;i<4;i++)assert.ok(Math.hypot(detected[i][0]-points[i][0],detected[i][1]-points[i][1])<15,JSON.stringify(detected));
  const blank=new Uint8ClampedArray(w*h*4).fill(255);assert.equal(await context.detect(blank,w,h),null,'do not crop a uniform background');image.delete();polygon.delete();
  const sw=400,sh=300,data=new Uint8ClampedArray(sw*sh*4),paper=[];
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const k=(y*sw+x)*4,light=100+140*x/(sw-1),stroke=y%40>=15&&y%40<18&&x>30&&x<370,v=stroke?light*.15:light;data[k]=data[k+1]=data[k+2]=v;data[k+3]=255;if(!stroke)paper.push(y*sw+x)}
  const original=context.ScanCore.enhance(data,sw,sh,{mode:'original'});assert.deepEqual(original,data);
  const output=context.ScanCore.enhance(data,sw,sh,{mode:'text',strength:100});
  const avg=arr=>arr.reduce((a,b)=>a+b,0)/arr.length;
  const bgLeft=avg(paper.filter(i=>i%sw>25&&i%sw<80).map(i=>output[i*4])),bgRight=avg(paper.filter(i=>i%sw>320&&i%sw<375).map(i=>output[i*4]));
  assert.ok(bgLeft>225&&Math.abs(bgLeft-bgRight)<22,`paper illumination ${bgLeft} vs ${bgRight}`);
  assert.ok(output[(16*sw+150)*4]<85,'preserve dark strokes');
  const bw=context.ScanCore.enhance(data,sw,sh,{mode:'bw',strength:100});assert.equal(bw[(16*sw+150)*4],0);assert.equal(bw[(25*sw+150)*4],255);
  const edgeFixture=new Uint8ClampedArray(100*100*4).fill(0);for(let i=3;i<edgeFixture.length;i+=4)edgeFixture[i]=255;
  const cleared=context.ScanCore.clearMargins(edgeFixture,100,100,2);assert.equal(cleared[0],255,'clear edge line');assert.equal(cleared[(50*100+50)*4],0,'preserve interior content');assert.deepEqual(context.ScanCore.clearMargins(edgeFixture,100,100,0),edgeFixture,'disable edge cleanup');
  const faint=new Uint8ClampedArray(100*100*4).fill(255);for(let y=45;y<49;y++)for(let x=20;x<80;x++){const k=(y*100+x)*4;faint[k]=faint[k+1]=faint[k+2]=190}
  const light=context.ScanCore.enhance(faint,100,100,{mode:'text',brightness:35}),dark=context.ScanCore.enhance(faint,100,100,{mode:'text',brightness:-35});assert.ok(light[(46*100+50)*4]>dark[(46*100+50)*4],'text brightness changes stroke intensity');
  const cw=180,ch=140,curved=new Uint8ClampedArray(cw*ch*4).fill(255);
  for(let x=0;x<cw;x++){const u=x/(cw-1),y=Math.round(60+10*4*u*(1-u));for(let dy=-1;dy<=1;dy++){const k=((y+dy)*cw+x)*4;curved[k]=curved[k+1]=curved[k+2]=0}}
  const flat=context.ScanCore.dewarp(curved,cw,ch,10/ch*100,10/ch*100);
  for(let x=10;x<cw-10;x++){let darkest=255,line=-1;for(let y=45;y<80;y++){if(flat[(y*cw+x)*4]<darkest){darkest=flat[(y*cw+x)*4];line=y}}assert.ok(Math.abs(line-60)<=2,'straighten curved horizontal stroke')}
  assert.deepEqual(context.ScanCore.dewarp(data,sw,sh,0,0),data,'zero warp identity');
  const partial=new cv.Mat(300,400,cv.CV_8UC4,new cv.Scalar(100,60,25,255));
  const pagePolygon=cv.matFromArray(4,1,cv.CV_32SC2,[60,0,399,0,399,299,70,299]);cv.fillConvexPoly(partial,pagePolygon,new cv.Scalar(205,205,205,255));
  const clipped=await context.detect(new Uint8ClampedArray(partial.data),400,300);assert.ok(clipped,'detect partially off-frame paper');assert.ok(clipped[0][0]>40&&clipped[0][0]<85,'preserve visible left paper edge');partial.delete();pagePolygon.delete();
  fs.writeFileSync('processing-before.rgba',data);fs.writeFileSync('processing-after.rgba',output);
  console.log('PASS: real OpenCV perspective detection, blank-image rejection, shadow normalization, stroke preservation, adaptive black/white, original identity, partial paper boundary, curved line straightening, edge cleanup, text brightness');
})().catch(e=>{console.error(e);process.exitCode=1});
