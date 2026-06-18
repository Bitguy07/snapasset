import{useRef,useEffect,useCallback,useState,useImperativeHandle,forwardRef}from'react'
import{processImagePixels,buildCSSFilter,hexToRgba}from'../utils/imageUtils'
function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])}
const MAG_R=70
const EnhancementCanvas=forwardRef(function EnhancementCanvas({
  baseImage,enhParams,bgSettings,shadowSettings,colorOverlay,
  eraserActive,eraserThickness,eraseStrokes,onNewEraseStroke,
  floodEraseAreas=[],onNewFloodErase,
  activeTool='none',removeColorTolerance=30,
  keepLoops=[],onNewKeepLoop,
  onUndo,onRedo,canUndo,canRedo,
},ref){
  const canvasRef=useRef(null),imgRef=useRef(null),baseImgDataRef=useRef(null)
  const processedRef=useRef(null),processPendRef=useRef(false)
  const baseScaleRef=useRef(1),zoomRef=useRef(1),panRef=useRef({x:0,y:0})
  const isPanningRef=useRef(false),lastMouseRef=useRef(null)
  const isErasingRef=useRef(false),currentStrokeRef=useRef([])
  const hovRef=useRef(false),mousePosRef=useRef([0,0]),rafRef=useRef(null)
  const rebuildRef=useRef(null),scheduleRef=useRef(null)
  const keepPathRef=useRef([]),isDrawingKeepRef=useRef(false)
  const [zoomPct,setZoomPct]=useState(100)

  // P4 fix: CSS-scale-corrected getPos eliminates squeeze/blur
  const getPos=(e)=>{
    const c=canvasRef.current,rect=c.getBoundingClientRect()
    const dpr=window.devicePixelRatio||1
    const sx=(c.width/dpr)/rect.width,sy=(c.height/dpr)/rect.height
    return[(e.clientX-rect.left)*sx,(e.clientY-rect.top)*sy]
  }
  const toCanvas=(ix,iy)=>{const ts=baseScaleRef.current*zoomRef.current;return[ix*ts+panRef.current.x,iy*ts+panRef.current.y]}
  const toImage=(cx,cy)=>{const ts=baseScaleRef.current*zoomRef.current;return[(cx-panRef.current.x)/ts,(cy-panRef.current.y)/ts]}

  // P6 fix: export at natural resolution, scale=1, pan={0,0}
  useImperativeHandle(ref,()=>({
    getExportCanvas:async()=>{
      if(!processedRef.current||!imgRef.current)return null
      const W=imgRef.current.naturalWidth,H=imgRef.current.naturalHeight
      const out=document.createElement('canvas');out.width=W;out.height=H
      const ctx=out.getContext('2d')
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high'
      // draw bg
      if(bgSettings.type==='solid'){ctx.fillStyle=bgSettings.color;ctx.fillRect(0,0,W,H)}
      else if(bgSettings.type==='gradient'&&bgSettings.gradStops?.length>1){
        const aR=((bgSettings.gradAngle??135)*Math.PI)/180,d=Math.sqrt(W*W+H*H)/2
        const gr=ctx.createLinearGradient(W/2-Math.cos(aR)*d,H/2-Math.sin(aR)*d,W/2+Math.cos(aR)*d,H/2+Math.sin(aR)*d);
        [...bgSettings.gradStops].sort((a,b)=>a.pos-b.pos).forEach(s=>gr.addColorStop(Math.min(1,Math.max(0,s.pos/100)),s.color));ctx.fillStyle=gr;ctx.fillRect(0,0,W,H)
      }
      if(shadowSettings.enabled){ctx.save();ctx.shadowBlur=shadowSettings.blur;ctx.shadowOffsetX=shadowSettings.x;ctx.shadowOffsetY=shadowSettings.y;ctx.shadowColor=hexToRgba(shadowSettings.color,shadowSettings.opacity/100)}
      ctx.filter=buildCSSFilter(enhParams)
      ctx.drawImage(processedRef.current,0,0,W,H)
      ctx.filter='none'
      if(shadowSettings.enabled)ctx.restore()
      if(colorOverlay.enabled){
        ctx.save();ctx.globalCompositeOperation='source-atop'
        if(colorOverlay.type==='gradient'&&colorOverlay.gradStops?.length>1){
          const aR2=((colorOverlay.gradAngle??135)*Math.PI)/180,d2=Math.sqrt(W*W+H*H)/2
          const gr2=ctx.createLinearGradient(W/2-Math.cos(aR2)*d2,H/2-Math.sin(aR2)*d2,W/2+Math.cos(aR2)*d2,H/2+Math.sin(aR2)*d2);
          [...colorOverlay.gradStops].sort((a,b)=>a.pos-b.pos).forEach(s=>gr2.addColorStop(Math.min(1,Math.max(0,s.pos/100)),s.color));ctx.fillStyle=gr2
        }else ctx.fillStyle=colorOverlay.color
        ctx.globalAlpha=(colorOverlay.opacity??30)/100;ctx.fillRect(0,0,W,H);ctx.restore()
      }
      return out
    }
  }))

  function renderToCtx(ctx,cssW,cssH,scale,pan,bg,shadow,co,ep,showLive){
    if(!processedRef.current||!imgRef.current)return
    const iW=imgRef.current.naturalWidth,iH=imgRef.current.naturalHeight
    const ts=scale,ix=pan.x,iy=pan.y,dw=iW*ts,dh=iH*ts
    ctx.clearRect(0,0,cssW,cssH)
    if(bg.type==='solid'){ctx.fillStyle=bg.color;ctx.fillRect(ix,iy,dw,dh)}
    else if(bg.type==='gradient'&&bg.gradStops?.length>1){
      const aR=((bg.gradAngle??135)*Math.PI)/180,d=Math.sqrt(dw*dw+dh*dh)/2
      const gr=ctx.createLinearGradient(ix+dw/2-Math.cos(aR)*d,iy+dh/2-Math.sin(aR)*d,ix+dw/2+Math.cos(aR)*d,iy+dh/2+Math.sin(aR)*d);
      [...bg.gradStops].sort((a,b)=>a.pos-b.pos).forEach(s=>gr.addColorStop(Math.min(1,Math.max(0,s.pos/100)),s.color));ctx.fillStyle=gr;ctx.fillRect(ix,iy,dw,dh)
    }
    if(shadow.enabled){ctx.save();ctx.shadowBlur=shadow.blur*scale;ctx.shadowOffsetX=shadow.x*scale;ctx.shadowOffsetY=shadow.y*scale;ctx.shadowColor=hexToRgba(shadow.color,shadow.opacity/100)}
    // P4 fix: high-quality smoothing
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high'
    ctx.filter=buildCSSFilter(ep)
    ctx.drawImage(processedRef.current,ix,iy,dw,dh)
    ctx.filter='none'
    if(shadow.enabled)ctx.restore()
    if(co.enabled){
      ctx.save();ctx.globalCompositeOperation='source-atop'
      if(co.type==='gradient'&&co.gradStops?.length>1){
        const aR2=((co.gradAngle??135)*Math.PI)/180,d2=Math.sqrt(dw*dw+dh*dh)/2
        const gr2=ctx.createLinearGradient(ix+dw/2-Math.cos(aR2)*d2,iy+dh/2-Math.sin(aR2)*d2,ix+dw/2+Math.cos(aR2)*d2,iy+dh/2+Math.sin(aR2)*d2);
        [...co.gradStops].sort((a,b)=>a.pos-b.pos).forEach(s=>gr2.addColorStop(Math.min(1,Math.max(0,s.pos/100)),s.color));ctx.fillStyle=gr2
      }else ctx.fillStyle=co.color
      ctx.globalAlpha=(co.opacity??30)/100;ctx.fillRect(ix,iy,dw,dh);ctx.restore()
    }
    if(!showLive)return
    // live erase path
    if(isErasingRef.current&&currentStrokeRef.current.length>1){
      const pts=currentStrokeRef.current.map(p=>toCanvas(p[0],p[1]))
      const r=(eraserThickness||20)/2*scale
      ctx.save();ctx.strokeStyle='rgba(255,80,80,0.6)';ctx.lineWidth=r*2;ctx.lineCap='round';ctx.lineJoin='round'
      ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);pts.slice(1).forEach(p=>ctx.lineTo(p[0],p[1]));ctx.stroke()
      ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=r*2+4;ctx.stroke();ctx.restore()
    }
    // keep loops overlay
    for(let li=0;li<keepLoops.length;li++){
      const loop=keepLoops[li];if(loop.length<3)continue
      const cp=loop.map(p=>toCanvas(p[0],p[1]))
      ctx.save();ctx.beginPath();ctx.moveTo(cp[0][0],cp[0][1]);cp.slice(1).forEach(p=>ctx.lineTo(p[0],p[1]));ctx.closePath()
      ctx.fillStyle='rgba(34,197,94,0.18)';ctx.fill();ctx.strokeStyle='#22c55e';ctx.lineWidth=1.5;ctx.setLineDash([6,3]);ctx.stroke();ctx.restore();ctx.setLineDash([])
    }
    // current keep path
    const kp=keepPathRef.current
    if(kp.length>=2){
      const cp=kp.map(p=>toCanvas(p[0],p[1]))
      ctx.save();ctx.beginPath();ctx.moveTo(cp[0][0],cp[0][1]);cp.slice(1).forEach(p=>ctx.lineTo(p[0],p[1]))
      ctx.strokeStyle='rgba(34,197,94,0.8)';ctx.lineWidth=1.8;ctx.stroke()
      ctx.beginPath();ctx.arc(cp[0][0],cp[0][1],5,0,Math.PI*2);ctx.strokeStyle='#22c55e';ctx.lineWidth=2;ctx.stroke();ctx.restore()
    }
    // magnifier
    const[mx,my]=mousePosRef.current
    if(hovRef.current&&(eraserActive||activeTool==='removeColor'||activeTool==='keepMarker')){
      const[imgMx,imgMy]=toImage(mx,my);const iw=iW,ih=iH
      if(imgMx>=0&&imgMy>=0&&imgMx<iw&&imgMy<ih){
        const hs=MAG_R/3.5;let lx=mx+20,ly=my-MAG_R*2-10
        if(lx+MAG_R*2>cssW-10)lx=mx-MAG_R*2-20;if(ly<10)ly=my+20
        ctx.save();ctx.beginPath();ctx.arc(lx+MAG_R,ly+MAG_R,MAG_R,0,Math.PI*2);ctx.clip()
        for(let bx=0;bx<MAG_R*2;bx+=8)for(let by=0;by<MAG_R*2;by+=8){ctx.fillStyle=((Math.floor(bx/8)+Math.floor(by/8))%2===0)?'#1e1e28':'#14141c';ctx.fillRect(lx+bx,ly+by,8,8)}
        ctx.drawImage(processedRef.current,Math.max(0,imgMx-hs),Math.max(0,imgMy-hs),hs*2,hs*2,lx,ly,MAG_R*2,MAG_R*2)
        ctx.restore()
        const tc=eraserActive?'#ff6b6b':activeTool==='removeColor'?'#ff5555':'#22c55e'
        ctx.beginPath();ctx.arc(lx+MAG_R,ly+MAG_R,MAG_R,0,Math.PI*2);ctx.strokeStyle=tc;ctx.lineWidth=2.5;ctx.stroke()
        ctx.save();ctx.strokeStyle=tc;ctx.lineWidth=1.2;ctx.globalAlpha=0.85;ctx.beginPath()
        ctx.moveTo(lx+MAG_R-8,ly+MAG_R);ctx.lineTo(lx+MAG_R+8,ly+MAG_R)
        ctx.moveTo(lx+MAG_R,ly+MAG_R-8);ctx.lineTo(lx+MAG_R,ly+MAG_R+8)
        ctx.stroke();ctx.restore()
      }
    }
    if(eraserActive&&hovRef.current){
      const r=(eraserThickness||20)/2*scale
      ctx.save();ctx.beginPath();ctx.arc(mx,my,r,0,Math.PI*2)
      ctx.strokeStyle='rgba(255,107,107,0.9)';ctx.lineWidth=2;ctx.stroke()
      ctx.fillStyle='rgba(255,100,100,0.1)';ctx.fill();ctx.restore()
    }
  }

  const rebuildProcessed=useCallback(()=>{
    if(!baseImgDataRef.current||!imgRef.current)return
    const{data,width,height}=baseImgDataRef.current
    const p=processImagePixels(data,width,height,{sharpness:enhParams.sharpness??0,alphaSmooth:enhParams.alphaSmooth??20,gamma:enhParams.gamma??50,hd:enhParams.hd??0,eraseStrokes,floodEraseAreas,keepLoops})
    if(!processedRef.current){processedRef.current=document.createElement('canvas');processedRef.current.width=width;processedRef.current.height=height}
    processedRef.current.getContext('2d').putImageData(new ImageData(p,width,height),0,0)
  },[enhParams.sharpness,enhParams.alphaSmooth,enhParams.gamma,enhParams.hd,eraseStrokes,floodEraseAreas,keepLoops])

  const scheduleRender=useCallback(()=>{
    if(rafRef.current)cancelAnimationFrame(rafRef.current)
    rafRef.current=requestAnimationFrame(()=>{
      const c=canvasRef.current;if(!c)return
      const dpr=window.devicePixelRatio||1,cssW=c.width/dpr,cssH=c.height/dpr
      const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0)
      renderToCtx(ctx,cssW,cssH,baseScaleRef.current*zoomRef.current,panRef.current,bgSettings,shadowSettings,colorOverlay,enhParams,true)
    })
  },[bgSettings,shadowSettings,colorOverlay,enhParams,eraserActive,eraserThickness,keepLoops,activeTool])

  useEffect(()=>{rebuildRef.current=rebuildProcessed},[rebuildProcessed])
  useEffect(()=>{scheduleRef.current=scheduleRender},[scheduleRender])
  useEffect(()=>{if(processPendRef.current)return;processPendRef.current=true;requestAnimationFrame(()=>{rebuildProcessed();processPendRef.current=false;scheduleRender()})},[rebuildProcessed,scheduleRender])
  useEffect(()=>{scheduleRender()},[scheduleRender])

  // P2 (card switch): preserve zoom when same image dimensions
  useEffect(()=>{
    if(!baseImage)return
    const img=new Image()
    img.onload=()=>{
      const prevW=imgRef.current?.naturalWidth,prevH=imgRef.current?.naturalHeight
      imgRef.current=img
      const tmp=document.createElement('canvas');tmp.width=img.naturalWidth;tmp.height=img.naturalHeight
      const tctx=tmp.getContext('2d');tctx.drawImage(img,0,0)
      baseImgDataRef.current=tctx.getImageData(0,0,img.naturalWidth,img.naturalHeight)
      processedRef.current=null
      const c=canvasRef.current;if(!c)return
      const dpr=window.devicePixelRatio||1,rect=c.getBoundingClientRect()
      const cssW=rect.width,cssH=rect.height
      if(!prevW||prevW!==img.naturalWidth||prevH!==img.naturalHeight){
        const scale=Math.min(cssW/img.naturalWidth,cssH/img.naturalHeight,1)
        baseScaleRef.current=scale;zoomRef.current=1
        panRef.current={x:(cssW-img.naturalWidth*scale)/2,y:(cssH-img.naturalHeight*scale)/2}
        setZoomPct(100)
      }
      rebuildRef.current?.();scheduleRef.current?.()
    }
    img.src=baseImage
  },[baseImage])

  // P4 fix: use getBoundingClientRect for accurate sizing
  const resizeCanvas=useCallback(()=>{
    const c=canvasRef.current;if(!c)return
    const dpr=window.devicePixelRatio||1,rect=c.getBoundingClientRect()
    const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr)
    if(c.width!==w||c.height!==h){c.width=w;c.height=h}
  },[])

  useEffect(()=>{resizeCanvas();const h=()=>{resizeCanvas();scheduleRef.current?.()};window.addEventListener('resize',h);return()=>window.removeEventListener('resize',h)},[resizeCanvas])

  const applyZoom=useCallback((nz,px,py)=>{
    const c=canvasRef.current,dpr=window.devicePixelRatio||1,cssW=c.width/dpr,cssH=c.height/dpr
    const cx=px??cssW/2,cy=py??cssH/2;nz=Math.min(10,Math.max(0.2,nz))
    const r=nz/zoomRef.current;panRef.current={x:cx-(cx-panRef.current.x)*r,y:cy-(cy-panRef.current.y)*r}
    zoomRef.current=nz;setZoomPct(Math.round(nz*100));scheduleRender()
  },[scheduleRender])

  const zoomFit=()=>{
    const img=imgRef.current,c=canvasRef.current;if(!img||!c)return
    const dpr=window.devicePixelRatio||1,cssW=c.width/dpr,cssH=c.height/dpr
    const scale=Math.min(cssW/img.naturalWidth,cssH/img.naturalHeight,1)
    baseScaleRef.current=scale;zoomRef.current=1
    panRef.current={x:(cssW-img.naturalWidth*scale)/2,y:(cssH-img.naturalHeight*scale)/2}
    setZoomPct(100);scheduleRender()
  }

  useEffect(()=>{keepPathRef.current=[];isDrawingKeepRef.current=false},[activeTool])

  const handleMouseDown=(e)=>{
    if(e.button===1||e.button===2||e.altKey){isPanningRef.current=true;lastMouseRef.current=[e.clientX,e.clientY];return}
    if(e.button!==0)return
    const[cx,cy]=getPos(e);const[ix,iy]=toImage(cx,cy)
    if(activeTool==='removeColor'&&processedRef.current){
      let insideAnyLoop = false
      for (const loop of keepLoops) {
        if (dist([ix,iy],[ix,iy])===0) { // dummy check to import/use helper logic if needed
          // Simple polygon point inclusion check
          let inside=false
          for(let i=0,j=loop.length-1;i<loop.length;j=i++){
            const xi=loop[i][0],yi=loop[i][1],xj=loop[j][0],yj=loop[j][1]
            if((yi>iy)!==(yj>iy)&&ix<(xj-xi)*(iy-yi)/(yj-yi)+xi)inside=!inside
          }
          if (inside) {
            insideAnyLoop = true
            break
          }
        }
      }
      if (insideAnyLoop) return

      const pctx=processedRef.current.getContext('2d'),px=pctx.getImageData(Math.round(ix),Math.round(iy),1,1).data
      if(px[3]>10)onNewFloodErase?.({x:ix,y:iy,tolerance:removeColorTolerance});return
    }
    if(activeTool==='keepMarker'){isDrawingKeepRef.current=true;keepPathRef.current=[[ix,iy]];scheduleRender();return}
    if(eraserActive){isErasingRef.current=true;currentStrokeRef.current=[[ix,iy]]}
  }
  const handleMouseMove=(e)=>{
    const[cx,cy]=getPos(e);mousePosRef.current=[cx,cy]
    const[ix,iy]=toImage(cx,cy);const iw=imgRef.current?.naturalWidth??0,ih=imgRef.current?.naturalHeight??0
    hovRef.current=ix>=0&&iy>=0&&ix<iw&&iy<ih
    if(isPanningRef.current){const dx=e.clientX-lastMouseRef.current[0],dy=e.clientY-lastMouseRef.current[1];lastMouseRef.current=[e.clientX,e.clientY];panRef.current={x:panRef.current.x+dx,y:panRef.current.y+dy};scheduleRender();return}
    if(isDrawingKeepRef.current&&activeTool==='keepMarker'){
      const kp=keepPathRef.current;if(!kp.length)return
      if(dist([cx,cy],toCanvas(kp[kp.length-1][0],kp[kp.length-1][1]))<3)return
      if(kp.length>12&&dist([cx,cy],toCanvas(kp[0][0],kp[0][1]))<20){isDrawingKeepRef.current=false;keepPathRef.current=[];onNewKeepLoop?.(kp);scheduleRender();return}
      keepPathRef.current=[...kp,[ix,iy]];scheduleRender();return
    }
    if(isErasingRef.current)currentStrokeRef.current.push([ix,iy])
    scheduleRender()
  }
  const handleMouseUp=()=>{
    isPanningRef.current=false
    if(isErasingRef.current&&currentStrokeRef.current.length>0){onNewEraseStroke?.({points:[...currentStrokeRef.current],thickness:eraserThickness});currentStrokeRef.current=[]}
    isErasingRef.current=false
  }
  const handleMouseLeave=()=>{hovRef.current=false;scheduleRender()}
  const handleWheel=(e)=>{e.preventDefault();const[mx,my]=getPos(e);applyZoom(zoomRef.current*(e.deltaY<0?1.12:1/1.12),mx,my)}
  const cursor=eraserActive?'none':activeTool==='removeColor'||activeTool==='keepMarker'?'crosshair':isPanningRef.current?'grabbing':'default'

  return(
    <div className="canvas-wrapper">
      <div className="canvas-toolbar">
        <div className="toolbar-undo-group">
          <button className="toolbar-undo-btn" onClick={onUndo} disabled={!canUndo}>↩</button>
          <button className="toolbar-undo-btn" onClick={onRedo} disabled={!canRedo}>↪</button>
        </div>
        <span className="canvas-hint" style={{color:'#a78bfa'}}>
          {eraserActive?'Drag to erase':activeTool==='removeColor'?'Click to remove color':activeTool==='keepMarker'?'Draw loop to keep area':'Scroll=zoom · Alt+drag=pan'}
        </span>
        <div className="zoom-controls">
          <button className="zoom-btn" onClick={()=>applyZoom(zoomRef.current/1.4)}>−</button>
          <span className="zoom-label">{zoomPct}%</span>
          <button className="zoom-btn" onClick={()=>applyZoom(zoomRef.current*1.4)}>+</button>
          <button className="zoom-btn zoom-fit" onClick={zoomFit}>⊡</button>
        </div>
        <span className="canvas-scroll-hint">Scroll=zoom · Alt+drag=pan</span>
      </div>
      <canvas ref={canvasRef} className="canvas-main" style={{cursor}}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave}
        onWheel={handleWheel} onContextMenu={e=>e.preventDefault()}/>
    </div>
  )
})
export default EnhancementCanvas
