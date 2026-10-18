(function(root){
  function fitStamp(stamp,pageRatio){
    const w=Math.max(.04,Math.min(.8,stamp.w)),h=w*pageRatio*stamp.ratio;
    const scale=Math.min(1,.8/h);
    return {...stamp,w:w*scale,h:h*scale,x:Math.max(0,Math.min(1-w*scale,stamp.x)),y:Math.max(0,Math.min(1-h*scale,stamp.y))};
  }
  function pdfPlacement(stamp,viewport){
    const [x,y]=viewport.convertToPdfPoint(stamp.x*viewport.width,(stamp.y+stamp.h)*viewport.height);
    return {x,y,width:stamp.w*viewport.width/viewport.scale,height:stamp.h*viewport.height/viewport.scale};
  }
  root.SigningCore={fitStamp,pdfPlacement};
})(globalThis);
