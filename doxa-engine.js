/* Doxa CC0 WASM adapter. All pixels stay in this worker; no network inference. */
(function(root){
  let ready,wasm;
  function bind(module){wasm=module;return api}
  function initialize(){
    if(wasm)return Promise.resolve(api);
    if(!ready)ready=new Promise((resolve,reject)=>{
      root.Module={locateFile:name=>new URL('./vendor/doxa/'+name,root.location.href).href,
        onRuntimeInitialized:()=>{bind(root.Module);resolve(api)},onAbort:reason=>reject(Error('文字增强引擎初始化失败：'+reason))};
      try{root.importScripts('./vendor/doxa/doxaWasm.js')}catch(error){reject(error)}
    });
    return ready;
  }
  function binary(gray,w,h,parameters){
    if(!wasm)throw Error('Doxa 尚未初始化');
    const out=new Uint8Array(w*h),halo=Math.floor(parameters.window/2),tile=512;
    // Halo tiles keep WASM temporary allocations bounded on phones. Sauvola
    // uses only local statistics, so tiled results equal a full-page pass.
    for(let y=0;y<h;y+=tile)for(let x=0;x<w;x+=tile){
      const x0=Math.max(0,x-halo),y0=Math.max(0,y-halo),x1=Math.min(w,x+tile+halo),y1=Math.min(h,y+tile+halo),tw=x1-x0,th=y1-y0;
      let input=0,output=0,algorithm;
      try{
        input=wasm._malloc(tw*th);output=wasm._malloc(tw*th);
        if(!input||!output)throw Error('文字增强内存不足，请减少图片尺寸');
        for(let row=0;row<th;row++)wasm.HEAPU8.set(gray.subarray((y0+row)*w+x0,(y0+row)*w+x1),input+row*tw);
        algorithm=new wasm.Binarization(wasm.Binarization.Algorithms.SAUVOLA);
        algorithm.initialize(input,tw,th);algorithm.toBinary(output,JSON.stringify(parameters));
        for(let row=y;row<Math.min(h,y+tile);row++)out.set(wasm.HEAPU8.subarray(output+(row-y0)*tw+x-x0,output+(row-y0)*tw+Math.min(w,x+tile)-x0),row*w+x);
      }finally{if(algorithm)algorithm.delete();if(output)wasm._free(output);if(input)wasm._free(input)}
    }
    return out;
  }
  const api={initialize,bind,binary};root.DoxaEngine=api;
})(globalThis);
