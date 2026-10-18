(function(root){
 const MM=72/25.4;
 function cardLayout(images,kind='id',direction='vertical'){
  const cards=images.filter(Boolean).map(im=>{const ratio=im.width/im.height;return kind==='other'?{w:Math.min(100,110*ratio),h:Math.min(110,100/ratio)}:{w:85.6,h:54}});
  if(!cards.length)return [];
  const horizontal=direction==='horizontal',gap=12,extent=cards.reduce((n,c)=>n+(horizontal?c.w:c.h),0),available=(horizontal?190:270)-gap*(cards.length-1),scale=Math.min(1,available/extent);for(const c of cards){c.w*=scale;c.h*=scale}const total=cards.reduce((n,c)=>n+(horizontal?c.w:c.h),0)+gap*(cards.length-1);let cursor=((horizontal?210:297)-total)/2;
  return cards.map(c=>{const p={x:horizontal?cursor:(210-c.w)/2,y:horizontal?(297-c.h)/2:cursor,...c};cursor+=(horizontal?c.w:c.h)+gap;return p})
 }
 const portraitSizes={one:[25,35],two:[35,49],smalltwo:[33,48]};
 function portraitSize(key){const [w,h]=portraitSizes[key]||portraitSizes.one;return {mmW:w,mmH:h,w:Math.round(w/25.4*300),h:Math.round(h/25.4*300)}}
 function cropRect(iw,ih,w,h,zoom,x,y){const scale=Math.max(w/iw,h/ih)*Math.max(1,zoom),sw=w/scale,sh=h/scale;return {sx:(iw-sw)*Math.max(0,Math.min(1,x)),sy:(ih-sh)*Math.max(0,Math.min(1,y)),sw,sh}}
 function sheetLayout(size){const columns=Math.floor(152/(size.mmW+2)),rows=Math.floor(102/(size.mmH+2)),totalW=columns*size.mmW+(columns-1)*2,totalH=rows*size.mmH+(rows-1)*2,out=[];for(let r=0;r<rows;r++)for(let c=0;c<columns;c++)out.push({x:(152-totalW)/2+c*(size.mmW+2),y:(102-totalH)/2+r*(size.mmH+2),w:size.mmW,h:size.mmH});return out}

 function pngDPI(bytes,dpi=300){
  if(bytes.length<33||bytes[0]!==137||bytes[1]!==80)throw Error('Invalid PNG');
  const chunk=new Uint8Array(21),view=new DataView(chunk.buffer),ppm=Math.round(dpi/.0254);view.setUint32(0,9);chunk.set([112,72,89,115],4);view.setUint32(8,ppm);view.setUint32(12,ppm);chunk[16]=1;let crc=0xffffffff;for(let i=4;i<17;i++){crc^=chunk[i];for(let b=0;b<8;b++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}view.setUint32(17,(crc^0xffffffff)>>>0);
  const parts=[bytes.slice(0,8)],input=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let offset=8;while(offset+12<=bytes.length){const length=input.getUint32(offset),end=offset+length+12;if(end>bytes.length)throw Error('Invalid PNG chunk');const type=String.fromCharCode(...bytes.slice(offset+4,offset+8));if(type!=='pHYs')parts.push(bytes.slice(offset,end));if(type==='IHDR')parts.push(chunk);offset=end}const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let cursor=0;for(const part of parts){out.set(part,cursor);cursor+=part.length}return out
 }
 root.DocumentCore={MM,cardLayout,portraitSize,cropRect,sheetLayout,pngDPI};
})(globalThis);
