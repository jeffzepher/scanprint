importScripts('./processing-core.js');
let enginePromise;
async function engine(){
  if(!enginePromise)enginePromise=(async()=>{importScripts('./vendor/opencv.js','./vendor/jscanify.js');const result=await new Promise(resolve=>{const value=self.cv;if(value.Mat)resolve({cv:value});else if(typeof value.then==='function')value.then(v=>resolve({cv:v}));else value.onRuntimeInitialized=()=>resolve({cv:value})});self.cv=result.cv;return result})();
  return enginePromise;
}
function ordered(points){
  const center=points.reduce((p,q)=>[p[0]+q[0]/4,p[1]+q[1]/4],[0,0]);
  points.sort((a,b)=>Math.atan2(a[1]-center[1],a[0]-center[0])-Math.atan2(b[1]-center[1],b[0]-center[0]));
  const first=points.reduce((best,p,i)=>p[0]+p[1]<points[best][0]+points[best][1]?i:best,0);
  return points.slice(first).concat(points.slice(0,first));
}
function refinePaperEdges(points,data,w,h){
  const center=points.reduce((c,p)=>[c[0]+p[0]/4,c[1]+p[1]/4],[0,0]);
  const sample=(x,y)=>{x=Math.max(0,Math.min(w-1,Math.round(x)));y=Math.max(0,Math.min(h-1,Math.round(y)));const k=(y*w+x)*4,max=Math.max(data[k],data[k+1],data[k+2]),min=Math.min(data[k],data[k+1],data[k+2]);return (max-min)/Math.max(max,1)};
  const lines=points.map((a,i)=>{
    const b=points[(i+1)%4],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);let nx=-dy/len,ny=dx/len;
    if((center[0]-(a[0]+b[0])/2)*nx+(center[1]-(a[1]+b[1])/2)*ny<0){nx=-nx;ny=-ny}
    const offsets=[],range=Math.round(Math.min(w,h)*.04);
    for(let j=2;j<=8;j++){
      const t=j/10,x=a[0]+dx*t,y=a[1]+dy*t;
      if(x<4||y<4||x>w-5||y>h-5)continue;
      let score=.09,best=0;
      for(let offset=-range;offset<=range;offset++){const px=x+offset*nx,py=y+offset*ny;if(px<4||py<4||px>w-5||py>h-5)continue;const transition=sample(px-3*nx,py-3*ny)-sample(px+3*nx,py+3*ny);const weighted=transition-Math.abs(offset)*.0005;if(weighted>score){score=weighted;best=offset}}
      if(score>.09)offsets.push(best);
    }
    const shift=offsets.length>=4?offsets.sort((a,b)=>a-b)[Math.floor(offsets.length/2)]:0;
    return {a:[a[0]+nx*shift,a[1]+ny*shift],d:[dx,dy]};
  });
  return points.map((p,i)=>{const left=lines[(i+3)%4],right=lines[i],cross=left.d[0]*right.d[1]-left.d[1]*right.d[0];if(Math.abs(cross)<1e-5)return p;const dx=right.a[0]-left.a[0],dy=right.a[1]-left.a[1],t=(dx*right.d[1]-dy*right.d[0])/cross;return [Math.max(0,Math.min(w-1,left.a[0]+t*left.d[0])),Math.max(0,Math.min(h-1,left.a[1]+t*left.d[1]))]});
}
async function detect(data,w,h){
  const {cv}=await engine(),src=cv.matFromArray(h,w,cv.CV_8UC4,data),gray=new cv.Mat(),blur=new cv.Mat(),mask=new cv.Mat(),closed=new cv.Mat(),kernel=cv.Mat.ones(5,5,cv.CV_8U);
  let best=null,bestScore=0;
  function inspect(binary,allowClipped=false){
    const contours=new cv.MatVector(),hierarchy=new cv.Mat();
    try{cv.findContours(binary,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);for(let i=0;i<contours.size();i++){
      const contour=contours.get(i),approx=new cv.Mat();
      try{const a=Math.abs(cv.contourArea(contour));if(a<w*h*.16)continue;const perimeter=cv.arcLength(contour,true);cv.approxPolyDP(contour,approx,perimeter*.02,true);
        if(approx.rows!==4&&allowClipped){for(const epsilon of [.035,.055,.075]){cv.approxPolyDP(contour,approx,perimeter*epsilon,true);if(approx.rows===4)break}}
        if(approx.rows!==4||!cv.isContourConvex(approx))continue;
        const points=ordered(Array.from({length:4},(_,j)=>[approx.data32S[j*2],approx.data32S[j*2+1]]));
        const touches=points.filter(([x,y])=>x<3||y<3||x>w-4||y>h-4).length;
        if(touches>=3&&!allowClipped)continue;
        if(allowClipped&&a>w*h*.985)continue;
        let cosine=0;for(let j=0;j<4;j++){const p=points[j],a=points[(j+3)%4],b=points[(j+1)%4];cosine+=Math.abs(((a[0]-p[0])*(b[0]-p[0])+(a[1]-p[1])*(b[1]-p[1]))/(Math.hypot(a[0]-p[0],a[1]-p[1])*Math.hypot(b[0]-p[0],b[1]-p[1])+1e-6))}
        const score=a/(w*h)*(1-cosine*.12)*(1-touches*.12);if(score>bestScore){bestScore=score;best=points}
      }finally{approx.delete();contour.delete()}
    }}finally{contours.delete();hierarchy.delete()}
  }
  try{
    cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
    for(const [low,high] of [[35,110],[70,200]]){cv.Canny(blur,mask,low,high);cv.morphologyEx(mask,closed,cv.MORPH_CLOSE,kernel);inspect(closed)}
    cv.threshold(blur,mask,0,255,cv.THRESH_BINARY+cv.THRESH_OTSU);inspect(mask);
    // Low-saturation connected paper regions also work when the page extends
    // outside the photograph or has a gently curved visible edge.
    const rgb=new cv.Mat(),hsv=new cv.Mat(),low=new cv.Mat(h,w,cv.CV_8UC3,new cv.Scalar(0,0,55)),high=new cv.Mat(h,w,cv.CV_8UC3,new cv.Scalar(180,62,255)),region=new cv.Mat(),regionClosed=new cv.Mat(),regionKernel=cv.Mat.ones(13,13,cv.CV_8U);
    try{cv.cvtColor(src,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,hsv,cv.COLOR_RGB2HSV);cv.inRange(hsv,low,high,region);cv.morphologyEx(region,regionClosed,cv.MORPH_CLOSE,regionKernel);inspect(regionClosed,true)}finally{rgb.delete();hsv.delete();low.delete();high.delete();region.delete();regionClosed.delete();regionKernel.delete()}
    // jscanify is a secondary candidate, still subject to the same quadrilateral
    // checks; do not accept its largest contour as a document unconditionally.
    if(!best){const scanner=new self.jscanify(),contour=scanner.findPaperContour(gray);if(contour){try{const candidate=new cv.MatVector(),binary=cv.Mat.zeros(h,w,cv.CV_8U);try{candidate.push_back(contour);cv.drawContours(binary,candidate,0,new cv.Scalar(255),-1);inspect(binary)}finally{candidate.delete();binary.delete()}}finally{contour.delete()}}}
    return best?refinePaperEdges(best,data,w,h):null;
  }finally{src.delete();gray.delete();blur.delete();mask.delete();closed.delete();kernel.delete()}
}
self.onmessage=async({data:message})=>{const {id,task,w,h,options}=message;try{const data=new Uint8ClampedArray(message.buffer);if(task==='detect'){self.postMessage({id,result:await detect(data,w,h)})}else{const flat=options?.flatten?ScanCore.dewarp(data,w,h,options.top,options.bottom):data;const enhanced=ScanCore.enhance(flat,w,h,options);const out=options?.mode!=='original'?ScanCore.clearMargins(enhanced,w,h,options?.margin||0):enhanced;self.postMessage({id,buffer:out.buffer},[out.buffer])}}catch(error){self.postMessage({id,error:String(error.message||error)})}};
