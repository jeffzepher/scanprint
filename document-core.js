(function(root){
 const MM=72/25.4;
 function cardLayout(images,kind='id',direction='vertical'){
  const cards=images.filter(Boolean).map(im=>{const ratio=im.width/im.height;return kind==='other'?{w:Math.min(100,110*ratio),h:Math.min(110,100/ratio)}:{w:85.6,h:54}});
  if(!cards.length)return [];
  const horizontal=direction==='horizontal',gap=12,extent=cards.reduce((n,c)=>n+(horizontal?c.w:c.h),0),available=(horizontal?190:270)-gap*(cards.length-1),scale=Math.min(1,available/extent);for(const c of cards){c.w*=scale;c.h*=scale}const total=cards.reduce((n,c)=>n+(horizontal?c.w:c.h),0)+gap*(cards.length-1);let cursor=((horizontal?210:297)-total)/2;
  return cards.map(c=>{const p={x:horizontal?cursor:(210-c.w)/2,y:horizontal?(297-c.h)/2:cursor,...c};cursor+=(horizontal?c.w:c.h)+gap;return p})
 }
 const portraitSizes={smallone:[22,32],one:[25,35],smalltwo:[33,48],two:[35,49],largetwo:[35,53],three:[55,84],mm3545:[35,45],mm4060:[40,60],square50:[50,50],square51:[51,51]};
 function portraitSize(key,custom){const [w,h]=key==='custom'?[Number(custom?.w),Number(custom?.h)]:(portraitSizes[key]||portraitSizes.one);if(!Number.isFinite(w)||!Number.isFinite(h)||w<10||w>100||h<10||h>150)throw Error('请输入有效尺寸：宽 10–100mm，高 10–150mm');return {mmW:w,mmH:h,w:Math.round(w/25.4*300),h:Math.round(h/25.4*300)}}
 function cropRect(iw,ih,w,h,zoom,x,y){const scale=Math.max(w/iw,h/ih)*Math.max(1,zoom),sw=w/scale,sh=h/scale;return {sx:(iw-sw)*Math.max(0,Math.min(1,x)),sy:(ih-sh)*Math.max(0,Math.min(1,y)),sw,sh}}
 function sheetLayout(size){const columns=Math.floor(152/(size.mmW+2)),rows=Math.floor(102/(size.mmH+2)),totalW=columns*size.mmW+(columns-1)*2,totalH=rows*size.mmH+(rows-1)*2,out=[];for(let r=0;r<rows;r++)for(let c=0;c<columns;c++)out.push({x:(152-totalW)/2+c*(size.mmW+2),y:(102-totalH)/2+r*(size.mmH+2),w:size.mmW,h:size.mmH});return out}

 function pngDPI(bytes,dpi=300){
  if(bytes.length<33||bytes[0]!==137||bytes[1]!==80)throw Error('Invalid PNG');
  const chunk=new Uint8Array(21),view=new DataView(chunk.buffer),ppm=Math.round(dpi/.0254);view.setUint32(0,9);chunk.set([112,72,89,115],4);view.setUint32(8,ppm);view.setUint32(12,ppm);chunk[16]=1;let crc=0xffffffff;for(let i=4;i<17;i++){crc^=chunk[i];for(let b=0;b<8;b++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}view.setUint32(17,(crc^0xffffffff)>>>0);
  const parts=[bytes.slice(0,8)],input=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=8;while(offset+12<=bytes.length){const length=input.getUint32(offset),end=offset+length+12;if(end>bytes.length)throw Error('Invalid PNG chunk');const type=String.fromCharCode(...bytes.slice(offset+4,offset+8));if(type!=='pHYs')parts.push(bytes.slice(offset,end));if(type==='IHDR')parts.push(chunk);offset=end}const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let cursor=0;for(const part of parts){out.set(part,cursor);cursor+=part.length}return out
 }
 // Linear-time grayscale guided filter: refine a soft matte using source edges.
 function refinePortraitAlpha(rgba,alpha,w,h,radius=4){
  const n=w*h;if(alpha.length!==n||rgba.length!==n*4)throw Error('Invalid matte dimensions');
  function box(src){const tmp=new Float32Array(n),out=new Float32Array(n),r=radius;
   for(let y=0;y<h;y++){let sum=0;for(let x=0;x<=Math.min(r,w-1);x++)sum+=src[y*w+x];for(let x=0;x<w;x++){tmp[y*w+x]=sum/(Math.min(w-1,x+r)-Math.max(0,x-r)+1);if(x-r>=0)sum-=src[y*w+x-r];if(x+r+1<w)sum+=src[y*w+x+r+1]}}
   for(let x=0;x<w;x++){let sum=0;for(let y=0;y<=Math.min(r,h-1);y++)sum+=tmp[y*w+x];for(let y=0;y<h;y++){out[y*w+x]=sum/(Math.min(h-1,y+r)-Math.max(0,y-r)+1);if(y-r>=0)sum-=tmp[(y-r)*w+x];if(y+r+1<h)sum+=tmp[(y+r+1)*w+x]}}return out}
  const guide=new Float32Array(n),sq=new Float32Array(n),product=new Float32Array(n);
  for(let i=0;i<n;i++){const g=(rgba[i*4]*.299+rgba[i*4+1]*.587+rgba[i*4+2]*.114)/255;guide[i]=g;sq[i]=g*g;product[i]=g*alpha[i]}
  const mean=box(guide),meanAlpha=box(alpha),corr=box(sq),cross=box(product),a=new Float32Array(n),b=new Float32Array(n);
  for(let i=0;i<n;i++){a[i]=(cross[i]-mean[i]*meanAlpha[i])/(Math.max(0,corr[i]-mean[i]*mean[i])+.001);b[i]=meanAlpha[i]-a[i]*mean[i]}
  const ma=box(a),mb=box(b),out=new Float32Array(n);for(let i=0;i<n;i++)out[i]=Math.max(0,Math.min(1,ma[i]*guide[i]+mb[i]));return out;
 }
 root.DocumentCore={refinePortraitAlpha,MM,cardLayout,portraitSize,cropRect,sheetLayout,pngDPI};
})(globalThis);
