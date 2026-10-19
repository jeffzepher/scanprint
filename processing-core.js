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
  const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
  function textParameters(w,h){return {window:Math.min(101,Math.max(25,Math.round(Math.min(w,h)*.032)))|1,k:.24}}
  function pictureLayer(gray,w,h){
    // Coarse tonal occupancy distinguishes continuous-tone pictures from sparse
    // glyphs and line drawings. This is image segmentation, without OCR.
    const cell=Math.max(6,Math.round(Math.min(w,h)/70)),gw=Math.ceil(w/cell),gh=Math.ceil(h/cell),seeds=new Uint8Array(gw*gh);
    for(let gy=0;gy<gh;gy++)for(let gx=0;gx<gw;gx++){
      let mid=0,dark=0,strong=0,total=0,count=0;
      for(let y=gy*cell;y<Math.min(h,(gy+1)*cell);y+=2)for(let x=gx*cell;x<Math.min(w,(gx+1)*cell);x+=2){const v=gray[y*w+x];mid+=v>45&&v<222;dark+=v<225;strong+=v<150;total+=v;count++}
      const p=gy*gw+gx;
      if(mid/count>.44&&dark/count>.58&&strong/count>.22&&total/count<190)seeds[p]=1;
    }
    const visited=new Uint8Array(seeds.length),mask=new Float32Array(seeds.length),queue=new Int32Array(seeds.length);
    for(let start=0;start<seeds.length;start++)if(seeds[start]&&!visited[start]){
      let head=0,tail=1,minX=gw,minY=gh,maxX=0,maxY=0;queue[0]=start;visited[start]=1;
      while(head<tail){const p=queue[head++],x=p%gw,y=Math.floor(p/gw);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(nx>=0&&nx<gw&&ny>=0&&ny<gh){const n=ny*gw+nx;if(seeds[n]&&!visited[n]){visited[n]=1;queue[tail++]=n}}
      }
      if(tail<6||maxX-minX<1||maxY-minY<1||(maxX-minX+1)/(maxY-minY+1)>8)continue;
      const rectangular=tail/((maxX-minX+1)*(maxY-minY+1))>.25;
      if(rectangular){for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)mask[y*gw+x]=1}
      else for(let j=0;j<tail;j++)mask[queue[j]]=1;
    }
    // Feather inside detected picture zones. Expanding a mask into the paper
    // would also preserve show-through there and create gray halos.
    const soft=meanBlur(mask,gw,gh,1);
    for(let i=0;i<soft.length;i++){const t=clamp((soft[i]-.34)/.32);soft[i]=t*t*(3-2*t)}
    return {mask:soft,w:gw,h:gh,cell};
  }
  function layerAt(layer,x,y){
    const sx=clamp((x+.5)/layer.cell-.5,0,layer.w-1),sy=clamp((y+.5)/layer.cell-.5,0,layer.h-1),ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
    const at=(xx,yy)=>layer.mask[Math.min(layer.h-1,yy)*layer.w+Math.min(layer.w-1,xx)];
    return at(ix,iy)*(1-fx)*(1-fy)+at(ix+1,iy)*fx*(1-fy)+at(ix,iy+1)*(1-fx)*fy+at(ix+1,iy+1)*fx*fy;
  }
  function enhanceText(gray,out,w,h,options,pictureGray){
    const parameters=textParameters(w,h),radius=Math.floor(parameters.window/2),local=meanBlur(gray,w,h,radius),square=new Float32Array(gray.length);
    for(let i=0;i<gray.length;i++)square[i]=gray[i]*gray[i];
    const variance=meanBlur(square,w,h,radius),pictures=options.mode==='text'?pictureLayer(gray,w,h):null;
    const binary=root.DoxaEngine?root.DoxaEngine.binary(gray,w,h,parameters):null;
    for(let y=0,i=0;y<h;y++)for(let x=0;x<w;x++,i++){
      const deviation=Math.sqrt(Math.max(0,variance[i]-local[i]*local[i])),threshold=local[i]*(1+parameters.k*(deviation/128-1));
      const v=gray[i],isInk=binary?binary[i]===0:v<=threshold;
      // Doxa supplies the foreground decision. A narrow soft edge preserves
      // antialiasing; confident stroke interiors become solid black.
      const distance=threshold-v-(options.brightness||0)*.3;
      let text=255*clamp(.5-distance/24);
      text=isInk?Math.min(127,text):Math.max(128,text);
      if(options.mode==='text'&&v>65&&v<230&&text<192){
        // A medium-gray pixel next to a much darker stroke core is subpixel
        // edge coverage. Keep that coverage instead of thickening the glyph.
        let darkest=v;
        for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++)darkest=Math.min(darkest,gray[yy*w+xx]);
        if(darkest<120&&v-darkest>24)text=Math.max(text,Math.min(isInk?127:255,255*(v-darkest)/(255-darkest)));
      }
      if(v<65)text=0;
      if(v>235)text=255;
      let value;
      if(options.mode==='bw')value=(isInk||v<65)&&v<=235?0:255;
      else{
        const mix=layerAt(pictures,x,y),tone=255*clamp((pictureGray[i]-18)/224);
        value=text*(1-mix)+tone*mix;
      }
      if(options.inkSaver)value=255-(255-value)*.72;
      out[i*4]=out[i*4+1]=out[i*4+2]=value;
    }
    return out;
  }
  function enhance(data,w,h,options={}){
    const {mode='original',brightness=0,ink=false,inkSaver=false,strength=75}=options,amount=strength/100,out=new Uint8ClampedArray(data.length);
    if(mode==='original'){out.set(data);for(let i=0;i<out.length;i+=4){if(ink&&Math.max(out[i],out[i+1],out[i+2])-Math.min(out[i],out[i+1],out[i+2])>38)out[i]=out[i+1]=out[i+2]=255;for(let c=0;c<3;c++)out[i+c]+=brightness*2;out[i+3]=255}return out}
    // Picture tones use the page white point. A stroke-removing max filter
    // inside a large dark photo is not a valid estimate of its illumination.
    let pictureGray;
    if(mode==='text'){
      pictureGray=new Uint8Array(w*h);const histogram=new Uint32Array(256);
      for(let i=0;i<pictureGray.length;i++){const k=i*4,v=Math.round(.299*data[k]+.587*data[k+1]+.114*data[k+2]);pictureGray[i]=v;histogram[v]++}
      let cumulative=0,paper=255;for(let v=0;v<256;v++){cumulative+=histogram[v];if(cumulative>=w*h*.97){paper=v;break}}
      const gain=Math.min(3.5,250/Math.max(40,paper));
      for(let i=0;i<pictureGray.length;i++){const k=i*4;pictureGray[i]=Math.min(255,Math.round(pictureGray[i]*gain+brightness*2));if(ink&&Math.max(data[k],data[k+1],data[k+2])-Math.min(data[k],data[k+1],data[k+2])>38)pictureGray[i]=255}
    }
    // Estimate the paper background at reduced resolution. A max filter removes
    // thin dark strokes before smoothing, so text does not become the light map.
    const scale=Math.min(1,640/Math.max(w,h)),sw=Math.max(1,Math.round(w*scale)),sh=Math.max(1,Math.round(h*scale)),small=new Float32Array(sw*sh);
    for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const k=(Math.min(h-1,Math.floor((y+.5)/scale))*w+Math.min(w-1,Math.floor((x+.5)/scale)))*4;small[y*sw+x]=.299*data[k]+.587*data[k+1]+.114*data[k+2]}
    const radius=Math.max(3,Math.round(Math.min(sw,sh)*.06));
    const background=meanBlur(maxLine(maxLine(small,sw,sh,radius,true),sw,sh,radius,false),sw,sh,Math.max(2,Math.round(radius*.7)));
    const gray=new Uint8Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const k=(y*w+x)*4,sx=Math.max(0,Math.min(sw-1,(x+.5)*sw/w-.5)),sy=Math.max(0,Math.min(sh-1,(y+.5)*sh/h-.5)),ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
      const sample=(xx,yy)=>background[Math.min(sh-1,yy)*sw+Math.min(sw-1,xx)];
      const bg=sample(ix,iy)*(1-fx)*(1-fy)+sample(ix+1,iy)*fx*(1-fy)+sample(ix,iy+1)*(1-fx)*fy+sample(ix+1,iy+1)*fx*fy;
      const lum=.299*data[k]+.587*data[k+1]+.114*data[k+2],gain=1+(Math.min(3.5,250/Math.max(bg,40))-1)*(mode==='natural'?amount:1);
      for(let c=0;c<3;c++)out[k+c]=data[k+c]*gain+brightness*2;
      gray[y*w+x]=Math.min(255,lum*gain+brightness*2);out[k+3]=255;
      if(ink&&Math.max(data[k],data[k+1],data[k+2])-Math.min(data[k],data[k+1],data[k+2])>38){gray[y*w+x]=255;out[k]=out[k+1]=out[k+2]=255}
    }
    if(mode==='natural')return out;
    return enhanceText(gray,out,w,h,options,pictureGray);
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
  function clearMargins(data,w,h,percent=0){
    const out=new Uint8ClampedArray(data),margin=Math.max(0,Math.round(Math.min(w,h)*Math.min(3,Math.max(0,percent))/100));
    if(!margin)return out;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<margin||x>=w-margin||y<margin||y>=h-margin){const i=(y*w+x)*4;out[i]=out[i+1]=out[i+2]=out[i+3]=255}
    return out;
  }
  root.ScanCore={enhance,meanBlur,dewarp,clearMargins,textParameters,pictureLayer};
})(globalThis);
