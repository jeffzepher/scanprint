import {historyStore} from './history.js?v=17';
import './signing-core.js';
const el=id=>document.getElementById(id),dialog=el('signDialog'),pageCanvas=el('signPage'),layer=el('signLayer'),pad=el('signaturePad'),pen=pad.getContext('2d');
let historyId=crypto.randomUUID(),exported=null;
let libraries,source=null,pdf=null,pageNumber=1,viewport=null,stamps=[],selected=null,strokes=[],current=null,inputType='text',busy=false,renderVersion=0;
function note(text){el('signStatus').textContent=text}
function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=()=>reject(Error('签字组件加载失败，请检查部署文件是否齐全'));document.head.append(script)})}
function libs(){if(!libraries)libraries=Promise.all([loadScript('./vendor/pdf.min.js'),loadScript('./vendor/pdf-lib.min.js')]).then(()=>{pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.min.js'}).catch(e=>{libraries=null;throw e});return libraries}
function setBusy(value){busy=value;el('signUpload').disabled=value;el('signExport').disabled=value||!source||!stamps.length;el('signAdd').disabled=value||!source;el('signPrevious').disabled=value||pageNumber<=1;el('signNext').disabled=value||!pdf||pageNumber>=pdf.numPages;el('signDelete').disabled=value||!selected;for(const id of ['signSize','signAngle','signRotateLeft','signRotateRight'])el(id).disabled=value||!selected}
async function resetSigning(){if(pdf)await pdf.destroy();pdf=null;source=null;stamps=[];selected=null;exported=null;historyId=crypto.randomUUID();pageNumber=1;pageCanvas.width=1;pageCanvas.height=1;layer.replaceChildren();el('signEmpty').hidden=false;el('signViewer').hidden=true;note('');drawStamps();setBusy(false)}
el('openSigning').onclick=async()=>{if(busy)return;setBusy(true);try{await saveHistory();await resetSigning();dialog.showModal();dialog.scrollTop=0}catch(e){note(e.message);setBusy(false)}};el('closeSigning').onclick=async()=>{if(busy)return;await saveHistory();dialog.close()};dialog.addEventListener('cancel',e=>{e.preventDefault();if(!busy)el('closeSigning').click()});
el('openScanner').onclick=()=>window.dispatchEvent(new Event('start-scan'));
el('signUpload').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(source&&!confirm('替换文件会清空当前签名位置，是否继续？'))return;
  setBusy(true);note('正在本地读取文件…');
  try{
    await libs();let nextPDF=null,nextSource;
    const bytes=new Uint8Array(await file.arrayBuffer()),isPDF=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
    if(isPDF){const document=await PDFLib.PDFDocument.load(bytes);if(document.isEncrypted)throw Error('暂不支持加密 PDF，请先解密');nextPDF=await pdfjsLib.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;nextSource={kind:'pdf',bytes,name:file.name}}
    else{const blobURL=URL.createObjectURL(file);try{const img=await image(blobURL),scale=Math.min(1,2400/Math.max(img.width,img.height)),c=canvas(Math.round(img.width*scale),Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);nextSource={kind:'image',canvas:c,name:file.name}}finally{URL.revokeObjectURL(blobURL)}}
    if(pdf)await pdf.destroy();pdf=nextPDF;source=nextSource;historyId=crypto.randomUUID();exported=null;stamps=[];selected=null;pageNumber=1;el('signFormat').value='pdf';el('signPNGOption').disabled=isPDF;el('signEmpty').hidden=true;el('signViewer').hidden=false;await renderPage();note('添加签名后拖到所需位置，可在不同页面分别添加。');await saveHistory();
  }catch(error){note('导入失败：'+error.message)}finally{setBusy(false)}
};
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
function image(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('无法读取图片，请使用 JPG、PNG 或 WebP'));im.src=src})}
async function renderPage(){
  const version=++renderVersion;
  if(pdf){const page=await pdf.getPage(pageNumber);if(version!==renderVersion)return;const natural=page.getViewport({scale:1}),scale=Math.min(2,1500/Math.max(natural.width,natural.height));viewport=page.getViewport({scale});pageCanvas.width=Math.ceil(viewport.width);pageCanvas.height=Math.ceil(viewport.height);await page.render({canvasContext:pageCanvas.getContext('2d'),viewport}).promise}
  else{pageCanvas.width=source.canvas.width;pageCanvas.height=source.canvas.height;pageCanvas.getContext('2d').drawImage(source.canvas,0,0);viewport=null}
  el('signPaper').style.aspectRatio=`${pageCanvas.width}/${pageCanvas.height}`;
  const height=Math.min(380,window.innerHeight*.42),width=Math.min(520,window.innerWidth-78,height*pageCanvas.width/pageCanvas.height);el('signPaper').style.width=width+'px';
  el('signPageNumber').textContent=`${pageNumber} / ${pdf?pdf.numPages:1}`;selected=null;drawStamps();setBusy(busy);
}
for(const [id,delta] of [['signPrevious',-1],['signNext',1]])el(id).onclick=async()=>{if(busy)return;setBusy(true);try{pageNumber+=delta;await renderPage()}catch(e){note(e.message)}finally{setBusy(false)}};
window.addEventListener('resize',()=>{if(!source||!dialog.open)return;const ratio=pageCanvas.width/pageCanvas.height;el('signPaper').style.width=Math.min(520,window.innerWidth-78,Math.min(380,window.innerHeight*.42)*ratio)+'px'});
function drawStamps(){
  layer.replaceChildren();for(const stamp of stamps.filter(s=>s.page===pageNumber)){
    const box=document.createElement('button');box.className='placed-signature'+(stamp.id===selected?' selected':'');box.type='button';box.setAttribute('aria-label','拖动签名位置');box.style.cssText=`left:${stamp.x*100}%;top:${stamp.y*100}%;width:${stamp.w*100}%;height:${stamp.h*100}%`;
    const img=new Image();img.src=stamp.png;img.alt='签名';img.draggable=false;box.append(img);let drag=null;
    box.onpointerdown=e=>{if(busy)return;e.preventDefault();selected=stamp.id;layer.querySelectorAll('.placed-signature').forEach(b=>b.classList.remove('selected'));box.classList.add('selected');el('signSize').value=stamp.w*100;el('signDelete').disabled=false;for(const id of ['signSize','signAngle','signRotateLeft','signRotateRight'])el(id).disabled=false;el('signAngle').value=stamp.angle||0;el('signAngleValue').value=(stamp.angle||0)+'°';drag={x:e.clientX,y:e.clientY,left:stamp.x,top:stamp.y};box.setPointerCapture(e.pointerId)};
    box.onpointermove=e=>{if(!drag||busy)return;const r=layer.getBoundingClientRect();stamp.x=Math.max(0,Math.min(1-stamp.w,drag.left+(e.clientX-drag.x)/r.width));stamp.y=Math.max(0,Math.min(1-stamp.h,drag.top+(e.clientY-drag.y)/r.height));box.style.left=stamp.x*100+'%';box.style.top=stamp.y*100+'%'};
    box.onpointerup=box.onpointercancel=()=>{drag=null;exported=null;saveHistory()};layer.append(box);
  }
  el('signDelete').disabled=!selected;for(const id of ['signSize','signAngle','signRotateLeft','signRotateRight'])el(id).disabled=busy||!selected;el('signExport').disabled=busy||!stamps.length;
}
el('signSize').oninput=()=>{const index=stamps.findIndex(s=>s.id===selected);if(index<0||busy)return;stamps[index]=SigningCore.fitStamp({...stamps[index],w:Number(el('signSize').value)/100},pageCanvas.width/pageCanvas.height);drawStamps();exported=null};
el('signSize').onchange=()=>saveHistory();
el('signDelete').onclick=()=>{if(busy)return;stamps=stamps.filter(s=>s.id!==selected);selected=null;drawStamps();exported=null;saveHistory()};
el('signAdd').onclick=()=>{el('signatureError').textContent='';el('signatureInput').showModal();pen.clearRect(0,0,pad.width,pad.height);strokes=[];current=null;el('signText').value='';setInput('text')};
el('cancelSignature').onclick=()=>el('signatureInput').close();
function setInput(type){inputType=type;el('typedSignature').hidden=type!=='text';el('handSignature').hidden=type!=='hand';el('signTextTab').setAttribute('aria-pressed',String(type==='text'));el('signHandTab').setAttribute('aria-pressed',String(type==='hand'))}
el('signTextTab').onclick=()=>setInput('text');el('signHandTab').onclick=()=>setInput('hand');
function drawPad(){pen.clearRect(0,0,pad.width,pad.height);for(const stroke of strokes){pen.strokeStyle=stroke.color;pen.fillStyle=stroke.color;pen.lineWidth=stroke.width;pen.lineCap=pen.lineJoin='round';const p=stroke.points;if(p.length===1){pen.beginPath();pen.arc(p[0].x,p[0].y,stroke.width/2,0,Math.PI*2);pen.fill();continue}pen.beginPath();pen.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++){const mid=i===p.length-1?p[i]:{x:(p[i].x+p[i+1].x)/2,y:(p[i].y+p[i+1].y)/2};pen.quadraticCurveTo(p[i].x,p[i].y,mid.x,mid.y)}pen.stroke()}}
function point(e){const r=pad.getBoundingClientRect();return {x:Math.max(0,Math.min(pad.width,(e.clientX-r.left)/r.width*pad.width)),y:Math.max(0,Math.min(pad.height,(e.clientY-r.top)/r.height*pad.height))}}
pad.onpointerdown=e=>{if(current)return;e.preventDefault();current={id:e.pointerId,color:el('signColor').value,width:penWidth(),points:[point(e)]};strokes.push(current);pad.setPointerCapture(e.pointerId);drawPad()};
pad.onpointermove=e=>{if(!current||current.id!==e.pointerId)return;const samples=e.getCoalescedEvents?.();for(const sample of samples?.length?samples:[e])current.points.push(point(sample));drawPad()};
pad.onpointerup=pad.onpointercancel=e=>{if(current?.id===e.pointerId)current=null};el('undoSignature').onclick=()=>{strokes.pop();current=null;drawPad()};el('clearSignature').onclick=()=>{strokes=[];current=null;drawPad()};
function trim(source){const cx=source.getContext('2d'),{data}=cx.getImageData(0,0,source.width,source.height);let left=source.width,top=source.height,right=-1,bottom=-1;for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(data[(y*source.width+x)*4+3]>10){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}if(right<0)throw Error('请先输入或书写签名');const out=canvas(right-left+21,bottom-top+21);out.getContext('2d').drawImage(source,left,top,right-left+1,bottom-top+1,10,10,right-left+1,bottom-top+1);return out}
el('placeSignature').onclick=async()=>{try{let result;if(inputType==='text'){const text=el('signText').value.trim();if(!text)throw Error('请输入签名文字');const c=canvas(1800,300),cx=c.getContext('2d');cx.font=`120px ${el('signFont').value}`;const width=cx.measureText(text).width;if(width>1700)cx.font=`${120*1700/width}px ${el('signFont').value}`;cx.fillStyle=el('signColor').value;cx.textBaseline='middle';cx.fillText(text,30,150);result=trim(c)}else result=trim(pad);const stamp=SigningCore.fitStamp({id:crypto.randomUUID(),page:pageNumber,x:.3,y:.6,w:.3,ratio:result.height/result.width,png:result.toDataURL('image/png'),inkPNG:result.toDataURL('image/png'),angle:0},pageCanvas.width/pageCanvas.height);stamps.push(stamp);selected=stamp.id;el('signSize').value=stamp.w*100;el('signatureInput').close();drawStamps();el('signAngle').value=0;el('signAngleValue').value='0°';exported=null;saveHistory();note('拖动签名定位，可调整大小与方向。')}catch(e){el('signatureError').textContent=e.message}};
function download(bytes,type,name){exported={blob:new Blob([bytes],{type}),filename:name};const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000)}
el('signExport').onclick=async()=>{
  if(busy||!stamps.length)return;setBusy(true);note('正在本地生成签字文件…');
  try{
    await libs();const name=source.name.replace(/\.[^.]+$/,'')+'-已签字';
    if(source.kind==='image'&&el('signFormat').value==='png'){
      const c=canvas(source.canvas.width,source.canvas.height),cx=c.getContext('2d');cx.drawImage(source.canvas,0,0);for(const s of stamps){const im=await image(s.png);cx.drawImage(im,s.x*c.width,s.y*c.height,s.w*c.width,s.h*c.height)}const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw Error('图片生成失败');download(await blob.arrayBuffer(),'image/png',name+'.png');
    }else{
      const doc=source.kind==='pdf'?await PDFLib.PDFDocument.load(source.bytes):await PDFLib.PDFDocument.create();
      if(source.kind==='image'){const im=await doc.embedPng(source.canvas.toDataURL('image/png')),page=doc.addPage([im.width*.75,im.height*.75]);page.drawImage(im,{x:0,y:0,width:page.getWidth(),height:page.getHeight()})}
      for(const s of stamps){const page=doc.getPage(s.page-1),im=await doc.embedPng(s.png);let placement;
        if(pdf){const original=await pdf.getPage(s.page),view=original.getViewport({scale:1});placement=SigningCore.pdfPlacement(s,view)}else placement={x:s.x*page.getWidth(),y:(1-s.y-s.h)*page.getHeight(),width:s.w*page.getWidth(),height:s.h*page.getHeight()};
        page.drawImage(im,{...placement,rotate:PDFLib.degrees(page.getRotation().angle)})
      }
      download(await doc.save(),'application/pdf',name+'.pdf');
    }
    await saveHistory(true);note('已生成签字文件，已保存到签字历史。iPhone 可在文件预览中分享或保存。');
  }catch(e){note('导出失败：'+e.message)}finally{setBusy(false)}
};
setBusy(false);

function penWidth(){return Number(el('penWidth').value)*pad.width/Math.max(1,pad.getBoundingClientRect().width)}
el('penWidth').oninput=()=>{const width=penWidth();el('penWidthValue').value=el('penWidth').value+'px';for(const stroke of strokes)stroke.width=width;drawPad()};
el('signAngle').oninput=()=>el('signAngleValue').value=el('signAngle').value+'°';
let rotationJob=0;
async function rotateSignature(angle){const stamp=stamps.find(s=>s.id===selected);if(!stamp||busy)return;setBusy(true);try{const token=++rotationJob;const original=await image(stamp.inkPNG||stamp.png);if(token!==rotationJob||stamp.id!==selected)return;angle=((angle+180)%360+360)%360-180;const r=angle*Math.PI/180,w=Math.max(1,Math.ceil(Math.abs(original.width*Math.cos(r))+Math.abs(original.height*Math.sin(r)))),h=Math.max(1,Math.ceil(Math.abs(original.width*Math.sin(r))+Math.abs(original.height*Math.cos(r)))),c=canvas(w,h),cx=c.getContext('2d');cx.translate(w/2,h/2);cx.rotate(r);cx.drawImage(original,-original.width/2,-original.height/2);const old=await image(stamp.png);if(token!==rotationJob||stamp.id!==selected)return;Object.assign(stamp,SigningCore.fitStamp({...stamp,inkPNG:stamp.inkPNG||stamp.png,png:c.toDataURL('image/png'),angle,ratio:h/w,w:stamp.w*w/old.width},pageCanvas.width/pageCanvas.height));el('signAngle').value=angle;el('signAngleValue').value=angle+'°';el('signSize').value=stamp.w*100;exported=null;drawStamps();await saveHistory()}finally{setBusy(false)}}
el('signAngle').onchange=()=>rotateSignature(Number(el('signAngle').value)).catch(e=>note(e.message));for(const [id,delta] of [['signRotateLeft',-90],['signRotateRight',90]])el(id).onclick=()=>{const s=stamps.find(s=>s.id===selected);if(s)rotateSignature((s.angle||0)+delta).catch(e=>note(e.message))};
async function saveHistory(asExport=false){if(!source)return;try{const snapshot=source.kind==='pdf'?{kind:'pdf',bytes:source.bytes,name:source.name}:{kind:'image',data:source.canvas.toDataURL('image/png'),name:source.name};const thumbCanvas=canvas(pageCanvas.width,pageCanvas.height),cx=thumbCanvas.getContext('2d');cx.drawImage(pageCanvas,0,0);for(const stamp of stamps.filter(s=>s.page===pageNumber)){const im=await image(stamp.png);cx.drawImage(im,stamp.x*thumbCanvas.width,stamp.y*thumbCanvas.height,stamp.w*thumbCanvas.width,stamp.h*thumbCanvas.height)}await historyStore.put({id:asExport?crypto.randomUUID():historyId,type:asExport?'sign':'draft',name:asExport?exported.filename:source.name,count:pdf?pdf.numPages:1,thumb:await historyStore.thumbnail(thumbCanvas.toDataURL('image/jpeg',.7)),size:exported?.blob.size||(source.bytes?.length||Math.round(snapshot.data.length*.75)),payload:{source:snapshot,stamps:structuredClone(stamps)},blob:asExport?exported?.blob:undefined,filename:asExport?exported?.filename:undefined})}catch(error){note('本地历史保存失败，请及时导出文件');if(asExport)throw Error('文件已生成，但签字历史保存失败，请保留下载文件')}}
window.saveSigningProgress=saveHistory;
window.addEventListener('open-history',async({detail:record})=>{if(record.type!=='sign'||busy)return;setBusy(true);try{await saveHistory();await libs();if(pdf)await pdf.destroy();const saved=record.payload.source;pdf=null;if(saved.kind==='pdf'){source={kind:'pdf',bytes:saved.bytes,name:saved.name};pdf=await pdfjsLib.getDocument({data:saved.bytes.slice(),isEvalSupported:false}).promise}else{const im=await image(saved.data),c=canvas(im.width,im.height);c.getContext('2d').drawImage(im,0,0);source={kind:'image',canvas:c,name:saved.name}}historyId=record.blob?crypto.randomUUID():record.id;exported=record.blob?{blob:record.blob,filename:record.filename}:null;stamps=structuredClone(record.payload.stamps);pageNumber=1;selected=null;el('signEmpty').hidden=true;el('signViewer').hidden=false;el('signPNGOption').disabled=!!pdf;el('signFormat').value='pdf';dialog.showModal();await renderPage();note('已打开历史文件，可继续签字。')}catch(e){note('打开失败：'+e.message)}finally{setBusy(false)}});

window.addEventListener('history-deleted',({detail:r})=>{if(r.type==='sign'&&r.id===historyId&&!busy)resetSigning()});

el('signHistory').onclick=async()=>{if(busy)return;await saveHistory();dialog.close();document.querySelector('[data-history=sign]').click();el('historyList').scrollIntoView({behavior:'smooth',block:'start'})};
