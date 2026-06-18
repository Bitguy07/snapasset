// BOX BLUR
function boxBlurRGBH(src,dst,w,h,r){const ia=1/(r+r+1);for(let i=0;i<h;i++){for(let c=0;c<3;c++){let ti=i*w,li=ti,ri=ti+r,fv=src[ti*4+c],lv=src[(ti+w-1)*4+c],val=(r+1)*fv;for(let j=0;j<r;j++)val+=src[(ti+j)*4+c];for(let j=0;j<=r;j++){val+=src[ri++*4+c]-fv;dst[ti++*4+c]=Math.round(val*ia)}for(let j=r+1;j<w-r;j++){val+=src[ri++*4+c]-src[li++*4+c];dst[ti++*4+c]=Math.round(val*ia)}for(let j=w-r;j<w;j++){val+=lv-src[li++*4+c];dst[ti++*4+c]=Math.round(val*ia)}}}}
function boxBlurRGBV(src,dst,w,h,r){const ia=1/(r+r+1);for(let i=0;i<w;i++){for(let c=0;c<3;c++){let ti=i,li=ti,ri=ti+r*w,fv=src[ti*4+c],lv=src[(ti+w*(h-1))*4+c],val=(r+1)*fv;for(let j=0;j<r;j++)val+=src[(ti+j*w)*4+c];for(let j=0;j<=r;j++){val+=src[ri*4+c]-fv;dst[ti*4+c]=Math.round(val*ia);ri+=w;ti+=w}for(let j=r+1;j<h-r;j++){val+=src[ri*4+c]-src[li*4+c];dst[ti*4+c]=Math.round(val*ia);li+=w;ri+=w;ti+=w}for(let j=h-r;j<h;j++){val+=lv-src[li*4+c];dst[ti*4+c]=Math.round(val*ia);li+=w;ti+=w}}}}
function boxBlurRGB(src,w,h,r){if(r<1)return new Uint8ClampedArray(src);const t=new Uint8ClampedArray(src.length),d=new Uint8ClampedArray(src.length);boxBlurRGBH(src,t,w,h,r);boxBlurRGBV(t,d,w,h,r);for(let i=3;i<src.length;i+=4)d[i]=src[i];return d}
function boxBlurAlphaH(src,dst,w,h,r){const ia=1/(r+r+1);for(let i=0;i<h;i++){let ti=i*w,li=ti,ri=ti+r,fv=src[ti*4+3],lv=src[(ti+w-1)*4+3],val=(r+1)*fv;for(let j=0;j<r;j++)val+=src[(ti+j)*4+3];for(let j=0;j<=r;j++){val+=src[ri++*4+3]-fv;dst[ti++*4+3]=Math.round(val*ia)}for(let j=r+1;j<w-r;j++){val+=src[ri++*4+3]-src[li++*4+3];dst[ti++*4+3]=Math.round(val*ia)}for(let j=w-r;j<w;j++){val+=lv-src[li++*4+3];dst[ti++*4+3]=Math.round(val*ia)}}}
function boxBlurAlphaV(src,dst,w,h,r){const ia=1/(r+r+1);for(let i=0;i<w;i++){let ti=i,li=ti,ri=ti+r*w,fv=src[ti*4+3],lv=src[(ti+w*(h-1))*4+3],val=(r+1)*fv;for(let j=0;j<r;j++)val+=src[(ti+j*w)*4+3];for(let j=0;j<=r;j++){val+=src[ri*4+3]-fv;dst[ti*4+3]=Math.round(val*ia);ri+=w;ti+=w}for(let j=r+1;j<h-r;j++){val+=src[ri*4+3]-src[li*4+3];dst[ti*4+3]=Math.round(val*ia);li+=w;ri+=w;ti+=w}for(let j=h-r;j<h;j++){val+=lv-src[li*4+3];dst[ti*4+3]=Math.round(val*ia);li+=w;ti+=w}}}
function blurAlpha(data,w,h,radius){if(radius<1)return new Uint8ClampedArray(data);const r=Math.max(1,Math.round(radius)),b1=new Uint8ClampedArray(data),b2=new Uint8ClampedArray(data.length);for(let p=0;p<3;p++){boxBlurAlphaH(b1,b2,w,h,r);boxBlurAlphaV(b2,b1,w,h,r)}return b1}

// HD ENHANCE
function hdEnhance(data,W,H,strength){
  if(strength<=0)return data;const s=strength/100;let out=new Uint8ClampedArray(data)
  const fine=boxBlurRGB(out,W,H,1),a1=s*1.8
  const mid=boxBlurRGB(out,W,H,5),a2=s*0.9
  const mac=boxBlurRGB(out,W,H,Math.max(1,Math.round(25*s))),a3=s*0.45
  for(let i=0;i<out.length;i+=4){if(out[i+3]<10)continue;for(let c=0;c<3;c++){const o=out[i+c];out[i+c]=Math.min(255,Math.max(0,Math.round(o+a1*(o-fine[i+c])+a2*(o-mid[i+c])+a3*(o-mac[i+c]))))}}
  return out
}

// FLOOD ERASE
export function applyFloodErase(data,W,H,sx,sy,tolerance,keepLoops=[]){
  const out=new Uint8ClampedArray(data),si=(Math.round(sy)*W+Math.round(sx))
  if(si<0||si>=W*H||out[si*4+3]<10)return out
  const tR=out[si*4],tG=out[si*4+1],tB=out[si*4+2],vis=new Uint8Array(W*H),st=[si];vis[si]=1
  const tol3=tolerance*3
  
  // Helper to check if a point lies inside any loop
  const isProtected = (px, py) => {
    for (const loop of keepLoops) {
      let inside = false
      for(let i=0,j=loop.length-1;i<loop.length;j=i++){
        const xi=loop[i][0],yi=loop[i][1],xj=loop[j][0],yj=loop[j][1]
        if((yi>py)!==(yj>py)&&px<(xj-xi)*(py-yi)/(yj-yi)+xi)inside=!inside
      }
      if (inside) return true
    }
    return false
  }

  while(st.length){
    const j=st.pop();
    if(out[j*4+3]<10)continue;
    if(Math.abs(out[j*4]-tR)+Math.abs(out[j*4+1]-tG)+Math.abs(out[j*4+2]-tB)>tol3)continue;
    
    const x=j%W,y=Math.floor(j/W);
    // Protect pixels inside keep loops from being erased
    if (isProtected(x, y)) continue;

    out[j*4+3]=0;
    if(x>0&&!vis[j-1]){vis[j-1]=1;st.push(j-1)}
    if(x<W-1&&!vis[j+1]){vis[j+1]=1;st.push(j+1)}
    if(y>0&&!vis[j-W]){vis[j-W]=1;st.push(j-W)}
    if(y<H-1&&!vis[j+W]){vis[j+W]=1;st.push(j+W)}
  }
  return out
}

// SOFT ERASE — eraseStrokes: [{points:[[x,y],...], thickness:number}]
function applySoftErase(out,W,H,strokes){
  for(const{points,thickness}of strokes){
    if(!points||!points.length)continue
    const r=(thickness||20)/2,feather=Math.max(1.5,r*0.28)
    for(let pi=0;pi<points.length;pi++){
      const[ex,ey]=points[pi],[ex2,ey2]=pi<points.length-1?points[pi+1]:points[pi]
      const sl=Math.hypot(ex2-ex,ey2-ey),steps=Math.min(80,Math.max(1,Math.ceil(sl*0.6)))
      for(let t=0;t<=steps;t++){
        const cx=ex+(ex2-ex)*t/steps,cy=ey+(ey2-ey)*t/steps
        const x0=Math.max(0,Math.floor(cx-r-1)),x1=Math.min(W-1,Math.ceil(cx+r+1))
        const y0=Math.max(0,Math.floor(cy-r-1)),y1=Math.min(H-1,Math.ceil(cy+r+1))
        for(let py=y0;py<=y1;py++)for(let px=x0;px<=x1;px++){
          const d=Math.hypot(px-cx,py-cy);if(d>r)continue
          const idx=(py*W+px)*4;if(out[idx+3]<=0)continue
          if(d<r-feather)out[idx+3]=0
          else{const f=(d-(r-feather))/feather;out[idx+3]=Math.round(out[idx+3]*f*f)}
        }
      }
    }
  }
}

export function processImagePixels(data,width,height,{sharpness,alphaSmooth,gamma,hd,eraseStrokes,floodEraseAreas,keepLoops=[]}){
  let out=new Uint8ClampedArray(data)
  if(sharpness>0){const s=sharpness/100*1.5,bl=boxBlurRGB(out,width,height,2);for(let i=0;i<out.length;i+=4)if(out[i+3]>0)for(let c=0;c<3;c++)out[i+c]=Math.min(255,Math.max(0,out[i+c]+s*(out[i+c]-bl[i+c])))}
  if(hd>0)out=hdEnhance(out,width,height,hd)
  if(gamma!==50){const g=0.2+(gamma/100)*1.8,inv=1/g,lut=new Uint8ClampedArray(256);for(let i=0;i<256;i++)lut[i]=Math.min(255,Math.round(Math.pow(i/255,inv)*255));for(let i=0;i<out.length;i+=4)if(out[i+3]>0){out[i]=lut[out[i]];out[i+1]=lut[out[i+1]];out[i+2]=lut[out[i+2]]}}
  if(alphaSmooth>0){const bl=blurAlpha(out,width,height,alphaSmooth/100*12);for(let i=3;i<out.length;i+=4)out[i]=bl[i]}
  if(eraseStrokes&&eraseStrokes.length>0)applySoftErase(out,width,height,eraseStrokes)
  if(floodEraseAreas&&floodEraseAreas.length>0)for(const{x,y,tolerance}of floodEraseAreas)out=applyFloodErase(out,width,height,x,y,tolerance||30,keepLoops)
  return out
}
export function buildCSSFilter({brightness,contrast,saturation,opacity}){
  const b=((brightness??50)/50)*100,c=((contrast??50)/50)*100,s=((saturation??50)/50)*100,o=opacity??100
  return`brightness(${b.toFixed(1)}%) contrast(${c.toFixed(1)}%) saturate(${s.toFixed(1)}%) opacity(${o}%)`
}
export function samplePixelFromCanvas(ctx,x,y){const d=ctx.getImageData(Math.round(x),Math.round(y),1,1).data;return{r:d[0],g:d[1],b:d[2],a:d[3]}}
export function invertColor(r,g,b){return`rgb(${255-r},${255-g},${255-b})`}
export function hexToRgba(hex,alpha=1){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`rgba(${r},${g},${b},${alpha})`}
