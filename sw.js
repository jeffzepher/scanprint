const CACHE='zhijian-v21';
const FILES=['./','./index.html','./style.css?v=21','./app.js?v=21','./scan-worker.js?v=21','./processing-core.js?v=21','./signature.js?v=21','./signing-core.js','./history.js?v=21','./documents.js?v=21','./document-core.js?v=21','./vendor/pdf.min.js','./vendor/pdf.worker.min.js','./vendor/pdf-lib.min.js','./vendor/opencv.js','./vendor/jscanify.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('zhijian-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 const request=event.request,url=new URL(request.url),navigation=request.mode==='navigate'||url.pathname.endsWith('/index.html');
 if(navigation){event.respondWith((async()=>{try{const response=await fetch(request,{cache:'no-store'});if(response.ok){const cache=await caches.open(CACHE);await cache.put('./index.html',response.clone());await cache.put('./',response.clone())}return response}catch(error){const cached=await caches.match('./index.html');if(cached)return cached;throw error}})());return}
 if(['reload','no-store'].includes(request.cache)){event.respondWith(fetch(request).catch(()=>caches.match(request)));return}
 event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(async response=>{if(response.ok&&url.pathname.includes('/vendor/vision/')){try{const cache=await caches.open(CACHE);await cache.put(request,response.clone())}catch{}}return response})));
});
