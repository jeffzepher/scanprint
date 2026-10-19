import {recognizePages,ocrImageSize} from './ocr-engine.js?v=23';

const $=id=>document.getElementById(id);
let session=null,controller=null,busy=false,saveQueue=Promise.resolve();
const dialog=$('ocrDialog'),text=$('ocrText'),select=$('ocrPage');
function page(){return session?.pages.find(p=>p.id===select.value)}
function note(message){$('ocrStatus').textContent=message}
function save(){if(!session)return;const fn=session.onSave;saveQueue=saveQueue.catch(()=>{}).then(fn);return saveQueue}
function updateButtons(){
  const hasText=session?.pages.some(p=>p.ocr?.text?.trim());
  $('ocrRecognize').disabled=$('ocrRecognizeAll').disabled=$('ocrLanguage').disabled=busy;
  $('ocrStop').hidden=!busy;text.readOnly=busy;
  $('ocrCopy').disabled=!page()?.ocr?.text?.trim();$('ocrCopyAll').disabled=$('ocrDownload').disabled=!hasText;
}
function showPage(){
  const p=page();text.value=p?.ocr?.text||'';
  $('ocrResultHint').textContent=p?.ocr?`识别结果可修改 · ${text.value.length} 字符`:'识别后可在这里修改、长按选择和复制文字';
  updateButtons();
}
function allText(){return session.pages.map((p,i)=>p.ocr?.text?.trim()?`第 ${i+1} 页\n${p.ocr.text.trim()}`:'').filter(Boolean).join('\n\n')}
export function openOCR({pages,name,onSave,pageId}){
  if(busy||dialog.open)return;
  session={pages:[...pages],name,onSave};select.replaceChildren();
  pages.forEach((p,i)=>{const option=document.createElement('option');option.value=p.id;option.textContent=`第 ${i+1} 页${p.ocr?' · 已提取':''}`;select.append(option)});
  select.value=pageId||pages[0]?.id;showPage();$('ocrProgress').hidden=true;
  note('中英文印刷体 · 本地识别。首次使用需下载识别资源，请保持页面打开。');dialog.showModal();
}
select.onchange=showPage;
text.oninput=()=>{
  const p=page();if(!p||busy)return;
  p.ocr={...p.ocr,text:text.value,editedAt:Date.now()};
  $('ocrResultHint').textContent=`识别结果可修改 · ${text.value.length} 字符`;updateButtons();
  clearTimeout(text.saveTimer);text.saveTimer=setTimeout(()=>save(),500);
};
async function imageForOCR(source){
  const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('图片无法读取'));image.src=source});
  const size=ocrImageSize(image.width,image.height),canvas=document.createElement('canvas');
  canvas.width=size.width+32;canvas.height=size.height+32;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,16,16,size.width,size.height);return canvas;
}
async function recognize(all){
  if(busy||!session)return;
  const targets=all?session.pages:[page()];
  if(targets.some(p=>p.ocr?.text)&&!confirm('重新识别会替换所选页面已有的文字，继续吗？'))return;
  busy=true;controller=new AbortController();updateButtons();$('ocrProgress').hidden=false;$('ocrProgress').value=0;
  note('正在加载本地识别引擎和字库…');
  try{
    const {default:Tesseract}=await import('./vendor/ocr/tesseract.esm.min.js');
    const result=await recognizePages(targets,{
      createWorker:Tesseract.createWorker,language:$('ocrLanguage').value,assetURL:new URL('./vendor/ocr/',import.meta.url),
      loadImage:imageForOCR,signal:controller.signal,
      onProgress:m=>{
        $('ocrProgress').value=(m.index+(m.stage==='recognizing'?m.progress:0))/targets.length;
        if(m.stage==='loading')note(`正在准备识别资源 · ${Math.round(m.progress*100)}%`);
        else note(`正在识别 ${m.index+1} / ${m.total} 页 · ${Math.round(m.progress*100)}%`);
      },
      onResult:async(p,result)=>{
        p.ocr=result;const option=[...select.options].find(o=>o.value===p.id);
        if(option)option.textContent=`第 ${session.pages.indexOf(p)+1} 页 · 已提取`;
        await save();if(page()?.id===p.id)showPage();
      }
    });
    $('ocrProgress').value=1;
    note(`已完成 ${result.completed} 页${result.failed.length?`，${result.failed.length} 页图片无法读取`:''}。可切换页面检查、修改并复制；公式和复杂排版请核对原图。`);
  }catch(error){note(error.name==='AbortError'?'已停止，已完成的识别结果已保留。':'识别未完成：'+(navigator.onLine===false?'当前离线，首次使用请联网加载资源后重试。':error.message)+' 已完成结果已保留。')}
  finally{busy=false;controller=null;updateButtons()}
}
$('ocrRecognize').onclick=()=>recognize(false);$('ocrRecognizeAll').onclick=()=>recognize(true);
$('ocrStop').onclick=()=>{controller?.abort();note('正在停止识别…')};
$('ocrClose').onclick=async()=>{if(busy){controller?.abort();note('正在停止识别，请稍后关闭');return}await save();dialog.close()};
dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();controller?.abort()}else save()});
dialog.addEventListener('close',()=>{clearTimeout(text.saveTimer);save()});
async function copy(value){
  try{await navigator.clipboard.writeText(value);note('文字已复制。')}
  catch{let success=false;const helper=document.createElement('textarea');helper.value=value;dialog.append(helper);helper.select();try{success=document.execCommand('copy')}catch{}helper.remove();if(success)note('文字已复制。');else{text.focus();text.select();note('请长按结果文字，选择并复制；也可导出 TXT。')}}
}
$('ocrCopy').onclick=()=>copy(text.value);$('ocrCopyAll').onclick=()=>copy(allText());
$('ocrDownload').onclick=()=>{
  const blob=new Blob(['\uFEFF'+allText()],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=(session.name||'扫描文字').replace(/[\\/:*?"<>|]/g,'_')+'.txt';dialog.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);
};
