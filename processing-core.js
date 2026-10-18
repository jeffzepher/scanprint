/* Local illumination normalization and adaptive document enhancement. */
(function(root){
  function maxLine(src,w,h,r,horizontal){
    const out=new Float32Array(src.length),len=horizontal?w:h,lines=horizontal?h:w,q=new Int32Array(len);
    for(let line=0;line<lines;line++){
      let head=0,tail=0,right=-1;
      const at=i=>horizontal?line*w+i:i*w+line;
      for(let i=0;i<len;i++){
        while(right<Math.min(len-1,i+r)){right++;while(tail>head&&src[at(q[tail-1])]<=src[at(right)])tail--;q[tail++]=right}
        while(q[head]<i-r)head++;
        out[at(i)]=src[at(q[head])];
      }
    }return out;
  }
  function meanBlur(src,w,h,r){
    const tmp=new Float32Array(src.length),out=new Float32Array(src.length);
    for(let y=0;y<h;y++){let sum=0,right=-1,left=0;for(let x=0;x<w;x++){while(right<Math.min(w-1,x+r))sum+=src[y*w+(++right)];while(left<Math.max(0,x-r))sum-=src[y*w+(left++)];tmp[y*w+x]=sum/(right-left+1)}}
    for(let x=0;x<w;x++){let sum=0,bottom=-1,top=0;for(let y=0;y<h;y++){while(bottom<Math.min(h-1,y+r))sum+=tmp[(++bottom)*w+x];while(top<Math.max(0,y-r))sum-=tmp[(top++)*w+x];out[y*w+x]=sum/(bottom-top+1)}}
    return out;
  }
  function enhance(data,w,h,options={}){
    const {mode='original',brightness=0,ink=false,strength=75}=options,amount=strength/100,out=new Uint8ClampedArray(data.length);
    if(mode==='original'){out.set(data);for(let i=0;i<out.length;i+=4){if(ink&&Math.max(out[i],out[i+1],out[i+2])-Math.min(out[i],out[i+1],out[i+2])>38)out[i]=out[i+1]=out[i+2]=255;for(let c=0;c<3;c++)out[i+c]+=brightness*2;out[i+3]=255}return out}
    // Estimate the paper background at reduced resolution. A max filter removes
    // thin dark strokes before smoothing, so text does not become the light map.
    const scale=Math.min(1,640/Math.max(w,h)),sw=Math.max(1,Math.round(w*scale)),sh=Math.max(1,Math.round(h*scale)),small=new Float32Array(sw*sh);
    for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const k=(Math.min(h-1,Math.floor((y+.5)/scale))*w+Math.min(w-1,Math.floor((x+.5)/scale)))*4;small[y*sw+x]=.299*data[k]+.587*data[k+1]+.114*data[k+2]}
    const radius=Math.max(3,Math.round(Math.min(sw,sh)*.025));
    const background=meanBlur(maxLine(maxLine(small,sw,sh,radius,true),sw,sh,radius,false),sw,sh,Math.max(2,Math.round(radius*.7)));
    const gray=new Float32Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const k=(y*w+x)*4,sx=Math.max(0,Math.min(sw-1,(x+.5)*sw/w-.5)),sy=Math.max(0,Math.min(sh-1,(y+.5)*sh/h-.5)),ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
      const sample=(xx,yy)=>background[Math.min(sh-1,yy)*sw+Math.min(sw-1,xx)];
      const bg=sample(ix,iy)*(1-fx)*(1-fy)+sample(ix+1,iy)*fx*(1-fy)+sample(ix,iy+1)*(1-fx)*fy+sample(ix+1,iy+1)*fx*fy;
      const lum=.299*data[k]+.587*data[k+1]+.114*data[k+2],gain=1+(Math.min(3.5,250/Math.max(bg,40))-1)*amount;
      for(let c=0;c<3;c++)out[k+c]=data[k+c]*gain+brightness*2;
      gray[y*w+x]=Math.min(255,lum*gain+brightness*2);out[k+3]=255;
      if(ink&&Math.max(data[k],data[k+1],data[k+2])-Math.min(data[k],data[k+1],data[k+2])>38){gray[y*w+x]=255;out[k]=out[k+1]=out[k+2]=255}
    }
    if(mode==='natural')return out;
    const local=meanBlur(gray,w,h,Math.max(7,Math.round(Math.min(w,h)*.012)));
    for(let i=0;i<gray.length;i++){
      const v=gray[i],mean=local[i];
      // Local thresholds track remaining shadows. Soft text keeps antialiased
      // strokes; binary mode is intended for plain printed text.
      const value=mode==='bw'?(v<mean-9?0:255):Math.min(255,Math.max(0,255-Math.max(0,mean-v-6)*3.1));
      out[i*4]=out[i*4+1]=out[i*4+2]=value;
    }return out;
  }
  function dewarp(data,w,h,top=0,bottom=0){
    if(!top&&!bottom)return new Uint8ClampedArray(data);
    const out=new Uint8ClampedArray(data.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const u=x/Math.max(1,w-1),v=y/Math.max(1,h-1),bow=4*u*(1-u);
      const sy=y+bow*h*(top*(1-v)+bottom*v)/100,k=(y*w+x)*4;
      if(sy<0||sy>h-1){out[k]=out[k+1]=out[k+2]=out[k+3]=255;continue}
      const y0=Math.floor(sy),f=sy-y0,a=(y0*w+x)*4,b=(Math.min(h-1,y0+1)*w+x)*4;
      for(let c=0;c<3;c++)out[k+c]=data[a+c]*(1-f)+data[b+c]*f;
      out[k+3]=255;
    }return out;
  }
  root.ScanCore={enhance,meanBlur,dewarp};
})(globalThis);
