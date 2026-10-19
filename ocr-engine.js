// The engine stays separate from the dialog so cancellation and serial page
// processing can be verified independently of the browser UI.
export function normalizeOCRText(text){
  return String(text||'').replace(/\r\n?/g,'\n').replace(/([\u3400-\u9fff])[\t ]+(?=[\u3400-\u9fff])/g,'$1').trim();
}
export function ocrImageSize(width,height){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('图片尺寸无效');
  // Small glyphs need enough pixels for segmentation. Upsampling does not
  // restore lost detail, but prevents the engine from skipping tiny lines.
  const scale=Math.min(3,2400/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),padding:16};
}
export async function recognizePages(pages,{createWorker,loadImage,language='chi_sim+eng',assetURL,onProgress=()=>{},onResult=async()=>{},signal,timeout=180000}){
  let worker,closed=false,abortListener,rejectAbort,rejectWorker;
  const aborted=()=>new DOMException('已停止识别','AbortError');
  const abortPromise=new Promise((_,reject)=>{rejectAbort=reject});
  const errorPromise=new Promise((_,reject)=>{rejectWorker=reject});
  // These promises can reject while between tasks. Keep them handled even then.
  abortPromise.catch(()=>{});errorPromise.catch(()=>{});
  const race=async task=>{let timer;try{return await Promise.race([task,abortPromise,errorPromise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('识别超时，请重试单页识别')),timeout)})])}finally{clearTimeout(timer)}};
  const check=()=>{if(signal?.aborted)throw aborted()};
  let current=0,completed=0;const failed=[];
  try{
    check();abortListener=()=>rejectAbort(aborted());signal?.addEventListener('abort',abortListener,{once:true});
    onProgress({stage:'loading',index:0,total:pages.length,progress:0});
    const creation=createWorker(language,1,{
      workerPath:new URL('worker.min.js',assetURL).href,
      corePath:new URL('core/',assetURL).href,
      langPath:new URL('lang',assetURL).href,
      workerBlobURL:false,gzip:true,
      logger:m=>{if(!closed)onProgress({stage:m.status==='recognizing text'?'recognizing':'loading',index:current,total:pages.length,progress:Math.max(0,Math.min(1,m.progress||0))})},
      errorHandler:error=>rejectWorker(Error(error?.message||String(error)))
    });
    // createWorker may resolve after cancellation while loading WASM/models.
    Promise.resolve(creation).then(w=>{if(closed)Promise.resolve(w.terminate()).catch(()=>{})},()=>{});
    worker=await race(creation);check();
    await race(worker.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'0',user_defined_dpi:'300'}));
    for(current=0;current<pages.length;current++){
      check();const page=pages[current];onProgress({stage:'recognizing',index:current,total:pages.length,progress:0});
      let image;
      try{image=await race(loadImage(page.working||page.output))}catch(error){check();failed.push(page.id);onProgress({stage:'page-error',index:current,total:pages.length,progress:0});continue}
      // Engine failures abort the session; an unreadable image alone can be skipped.
      const result=await race(worker.recognize(image,{}, {text:true}));check();
      await onResult(page,{text:normalizeOCRText(result.data.text),confidence:result.data.confidence,language,createdAt:Date.now()});
      completed++;onProgress({stage:'recognizing',index:current,total:pages.length,progress:1});
    }
    return {completed,failed};
  }finally{
    closed=true;signal?.removeEventListener('abort',abortListener);
    if(worker)try{await worker.terminate()}catch{}
  }
}
