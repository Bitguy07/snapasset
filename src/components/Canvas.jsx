import { useRef, useEffect, useCallback, useState } from 'react'
import { samplePixelFromCanvas, invertColor } from '../utils/imageUtils'

function ccw(A,B,C){return(C[1]-A[1])*(B[0]-A[0])>(B[1]-A[1])*(C[0]-A[0])}
function segsIntersect(A,B,C,D){return ccw(A,C,D)!==ccw(B,C,D)&&ccw(A,B,C)!==ccw(A,B,D)}
function dist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])}
function pointInPoly(px,py,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];if((yi>py)!==(yj>py)&&px<(xj-xi)*(py-yi)/(yj-yi)+xi)inside=!inside}return inside}

const MAG_R=70

export default function Canvas({
  imageFile, onLassoClosed, phase,
  activeTool='lasso',
  removeColorTolerance=30,
  onRemoveClick,        // single-click remove: called with {x,y,tolerance,invColor}
  removePoints=[],
  onNewKeepLoop,        // called with closed loop [[x,y],...]
  keepLoops=[],
  keepProtected=false,
  onUndo, onRedo, canUndo, canRedo,
}) {
  const canvasRef    = useRef(null)
  const imgRef       = useRef(null)
  const srcCtxRef    = useRef(null)
  const pathRef      = useRef([])
  const isDrawingRef = useRef(false)
  const closedRef    = useRef(false)

  // Keep Marker lasso refs
  const keepPathRef     = useRef([])
  const isDrawingKeepRef= useRef(false)

  const isPanningRef    = useRef(false)
  const lastMouseRef    = useRef(null)
  const mouseCanvasRef  = useRef([0,0])
  const hovToolRef      = useRef(false)
  const renderRef       = useRef(null)

  const baseScaleRef = useRef(1)
  const zoomRef      = useRef(1)
  const panRef       = useRef({x:0,y:0})

  const [zoomPct, setZoomPct]   = useState(100)
  const [hint, setHint]         = useState('Draw a freehand loop around any element')
  const [closed, setClosed]     = useState(false)

  // ── CSS-corrected position (fixes cursor misalignment Seg P1ii & P2i) ────────
  const getPos = (e) => {
    const c = canvasRef.current
    const rect = c.getBoundingClientRect()
    const dpr  = window.devicePixelRatio || 1
    // Account for any difference between canvas logical size and CSS rendered size
    const scaleX = (c.width / dpr) / rect.width
    const scaleY = (c.height / dpr) / rect.height
    return [(e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY]
  }

  const toCanvas = (ix,iy) => {const ts=baseScaleRef.current*zoomRef.current;return[ix*ts+panRef.current.x,iy*ts+panRef.current.y]}
  const toImage  = (cx,cy) => {const ts=baseScaleRef.current*zoomRef.current;return[(cx-panRef.current.x)/ts,(cy-panRef.current.y)/ts]}

  // ── Magnifier ────────────────────────────────────────────────────────────────
  const drawMag = (ctx, cx, cy, toolColor) => {
    if (!imgRef.current) return
    const [ix,iy] = toImage(cx,cy)
    const iw=imgRef.current.naturalWidth, ih=imgRef.current.naturalHeight
    if (ix<0||iy<0||ix>=iw||iy>=ih) return
    const c = canvasRef.current, dpr=window.devicePixelRatio||1
    const cssW=c.width/dpr, cssH=c.height/dpr
    let mx=cx+20, my=cy-MAG_R*2-10
    if (mx+MAG_R*2>cssW-10) mx=cx-MAG_R*2-20
    if (my<10) my=cy+20
    const halfSrc=MAG_R/3.5
    ctx.save()
    ctx.beginPath(); ctx.arc(mx+MAG_R,my+MAG_R,MAG_R,0,Math.PI*2); ctx.clip()
    for(let bx=0;bx<MAG_R*2;bx+=8)for(let by=0;by<MAG_R*2;by+=8){
      ctx.fillStyle=((Math.floor(bx/8)+Math.floor(by/8))%2===0)?'#1e1e28':'#14141c'
      ctx.fillRect(mx+bx,my+by,8,8)
    }
    ctx.drawImage(imgRef.current,Math.max(0,ix-halfSrc),Math.max(0,iy-halfSrc),halfSrc*2,halfSrc*2,mx,my,MAG_R*2,MAG_R*2)
    ctx.restore()
    ctx.beginPath(); ctx.arc(mx+MAG_R,my+MAG_R,MAG_R,0,Math.PI*2)
    ctx.strokeStyle=toolColor; ctx.lineWidth=2.5; ctx.stroke()
    // Crosshair inside magnifier
    ctx.save(); ctx.strokeStyle=toolColor; ctx.lineWidth=1.2; ctx.globalAlpha=0.85
    ctx.beginPath()
    ctx.moveTo(mx+MAG_R-8,my+MAG_R); ctx.lineTo(mx+MAG_R+8,my+MAG_R)
    ctx.moveTo(mx+MAG_R,my+MAG_R-8); ctx.lineTo(mx+MAG_R,my+MAG_R+8)
    ctx.stroke(); ctx.restore()
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio||1
    const cssW=canvas.width/dpr, cssH=canvas.height/dpr
    ctx.setTransform(dpr,0,0,dpr,0,0)
    ctx.clearRect(0,0,cssW,cssH)
    if (!imgRef.current) return

    const ts=baseScaleRef.current*zoomRef.current
    ctx.setTransform(ts*dpr,0,0,ts*dpr,panRef.current.x*dpr,panRef.current.y*dpr)
    ctx.imageSmoothingEnabled=zoomRef.current<1.5; ctx.imageSmoothingQuality='high'
    ctx.drawImage(imgRef.current,0,0)
    ctx.setTransform(dpr,0,0,dpr,0,0)

    // Main lasso
    const pts = pathRef.current
    if (pts.length>=2) {
      const cp=pts.map(p=>toCanvas(p[0],p[1]))
      ctx.beginPath(); ctx.moveTo(cp[0][0],cp[0][1]); cp.slice(1).forEach(p=>ctx.lineTo(p[0],p[1]))
      if (closedRef.current) { ctx.closePath(); ctx.fillStyle='rgba(80,200,255,0.13)'; ctx.fill() }
      ctx.strokeStyle=closedRef.current?'#00ffaa':'#38bdf8'; ctx.lineWidth=closedRef.current?2:1.5
      ctx.setLineDash(closedRef.current?[]:[5,3]); ctx.stroke(); ctx.setLineDash([])
      ctx.beginPath(); ctx.arc(cp[0][0],cp[0][1],5,0,Math.PI*2)
      ctx.fillStyle=closedRef.current?'#00ffaa':'#38bdf8'; ctx.fill()
    }

    // Completed keep loops
    // Completed keep loops
    for (let li=0; li<keepLoops.length; li++) {
      const loop=keepLoops[li]
      if (loop.length<3) continue
      const cp=loop.map(p=>toCanvas(p[0],p[1]))
      ctx.save()
      ctx.beginPath(); ctx.moveTo(cp[0][0],cp[0][1]); cp.slice(1).forEach(p=>ctx.lineTo(p[0],p[1])); ctx.closePath()
      ctx.fillStyle='rgba(34,197,94,0.18)'
      ctx.fill()
      ctx.strokeStyle='#22c55e'
      ctx.lineWidth=1.5
      ctx.setLineDash([6,3])
      ctx.stroke()
      ctx.restore()
      ctx.setLineDash([])
    }

    // Current keep loop being drawn
    const kp = keepPathRef.current
    if (kp.length>=2) {
      const cp=kp.map(p=>toCanvas(p[0],p[1]))
      ctx.save(); ctx.beginPath(); ctx.moveTo(cp[0][0],cp[0][1]); cp.slice(1).forEach(p=>ctx.lineTo(p[0],p[1]))
      ctx.strokeStyle='rgba(34,197,94,0.8)'; ctx.lineWidth=1.8; ctx.setLineDash([])
      ctx.stroke()
      // Start dot
      ctx.beginPath(); ctx.arc(cp[0][0],cp[0][1],5,0,Math.PI*2)
      ctx.strokeStyle='#22c55e'; ctx.lineWidth=2; ctx.stroke()
      ctx.restore()
    }

    // Remove points
    for (const rp of removePoints) {
      const [cx2,cy2]=toCanvas(rp.x,rp.y)
      ctx.save(); ctx.beginPath(); ctx.arc(cx2,cy2,7,0,Math.PI*2)
      ctx.fillStyle=rp.invColor||'#ff4444'; ctx.fill()
      ctx.strokeStyle='white'; ctx.lineWidth=1.5; ctx.stroke()
      ctx.strokeStyle='white'; ctx.lineWidth=1.5; ctx.beginPath()
      ctx.moveTo(cx2-3,cy2-3); ctx.lineTo(cx2+3,cy2+3)
      ctx.moveTo(cx2+3,cy2-3); ctx.lineTo(cx2-3,cy2+3)
      ctx.stroke(); ctx.restore()
    }

    // Magnifier for tools (magnifier pos is fine — don't change it)
    const [mx,my]=mouseCanvasRef.current
    if (hovToolRef.current) {
      if (activeTool==='removeColor') drawMag(ctx,mx,my,'#ff5555')
      else if (activeTool==='keepMarker') drawMag(ctx,mx,my,'#22c55e')
    }
  }, [activeTool, keepLoops, keepProtected, removePoints])

  useEffect(()=>{renderRef.current=render},[render])

  // ── Resize ───────────────────────────────────────────────────────────────────
  const resizeCanvas = useCallback(()=>{
    const c=canvasRef.current; if(!c)return
    const dpr=window.devicePixelRatio||1,cssW=c.offsetWidth,cssH=c.offsetHeight
    if(c.width!==cssW*dpr||c.height!==cssH*dpr){c.width=cssW*dpr;c.height=cssH*dpr}
  },[])

  // ── Load image — ONLY on imageFile change ────────────────────────────────────
  useEffect(()=>{
    if(!imageFile)return
    closedRef.current=false; pathRef.current=[]; setClosed(false)
    setHint('Draw a freehand loop around any element')
    const img=new Image()
    img.onload=()=>{
      imgRef.current=img
      const tmp=document.createElement('canvas'); tmp.width=img.naturalWidth; tmp.height=img.naturalHeight
      const tctx=tmp.getContext('2d'); tctx.drawImage(img,0,0); srcCtxRef.current=tctx
      resizeCanvas()
      const c=canvasRef.current,dpr=window.devicePixelRatio||1
      const cssW=c.width/dpr,cssH=c.height/dpr
      const scale=Math.min(cssW/img.naturalWidth,cssH/img.naturalHeight,1)
      baseScaleRef.current=scale; zoomRef.current=1
      panRef.current={x:(cssW-img.naturalWidth*scale)/2,y:(cssH-img.naturalHeight*scale)/2}
      setZoomPct(100); renderRef.current?.()
    }
    img.src=URL.createObjectURL(imageFile)
  },[imageFile,resizeCanvas])

  useEffect(()=>{
    const h=()=>{resizeCanvas();renderRef.current?.()}
    window.addEventListener('resize',h); return()=>window.removeEventListener('resize',h)
  },[resizeCanvas])

  useEffect(()=>{render()},[render])

  // Reset keep drawing when tool changes
  useEffect(()=>{keepPathRef.current=[];isDrawingKeepRef.current=false},[activeTool])

  // ── Zoom ─────────────────────────────────────────────────────────────────────
  const applyZoom=useCallback((newZ,px,py)=>{
    const c=canvasRef.current,dpr=window.devicePixelRatio||1
    const cssW=c.width/dpr,cssH=c.height/dpr
    const cx=px??cssW/2,cy=py??cssH/2
    newZ=Math.min(10,Math.max(0.2,newZ)); const ratio=newZ/zoomRef.current
    panRef.current={x:cx-(cx-panRef.current.x)*ratio,y:cy-(cy-panRef.current.y)*ratio}
    zoomRef.current=newZ; setZoomPct(Math.round(newZ*100)); render()
  },[render])

  const zoomFit=()=>{
    const img=imgRef.current,c=canvasRef.current; if(!img||!c)return
    const dpr=window.devicePixelRatio||1,cssW=c.width/dpr,cssH=c.height/dpr
    const scale=Math.min(cssW/img.naturalWidth,cssH/img.naturalHeight,1)
    baseScaleRef.current=scale; zoomRef.current=1
    panRef.current={x:(cssW-img.naturalWidth*scale)/2,y:(cssH-img.naturalHeight*scale)/2}
    setZoomPct(100); render()
  }

  const closeLasso=useCallback((imgPts)=>{
    isDrawingRef.current=false; pathRef.current=imgPts; closedRef.current=true; setClosed(true)
    render(); setHint('✓ Shape closed — sending to processor…'); onLassoClosed(imgPts)
  },[render,onLassoClosed])

  // ── Mouse ─────────────────────────────────────────────────────────────────────
  const handleMouseDown=(e)=>{
    if(!imgRef.current)return
    if(e.button===1||e.button===2||e.altKey){isPanningRef.current=true;lastMouseRef.current=[e.clientX,e.clientY];return}
    if(e.button!==0)return
    const[cx,cy]=getPos(e)
    const[ix,iy]=toImage(cx,cy)

    // Remove Color — single click, immediate (Seg P1i) ──────────────────────────
    if(activeTool==='removeColor'&&closedRef.current&&srcCtxRef.current){
      // Check protect: if point is inside ANY of the keepLoops, skip/protect from removal
      let insideAnyLoop = false
      for (const loop of keepLoops) {
        if (pointInPoly(ix,iy,loop)) {
          insideAnyLoop = true
          break
        }
      }
      if (insideAnyLoop) return

      const px=samplePixelFromCanvas(srcCtxRef.current,ix,iy)
      if(px.a>10){
        const inv=invertColor(px.r,px.g,px.b)
        onRemoveClick?.({x:ix,y:iy,tolerance:removeColorTolerance,invColor:inv})
      }
      return
    }

    // Keep Marker — lasso loop drawing (Seg P2ii) ─────────────────────────────
    if(activeTool==='keepMarker'&&closedRef.current){
      isDrawingKeepRef.current=true
      keepPathRef.current=[[ix,iy]]
      setHint('Keep drawing… close the loop to protect area')
      render(); return
    }

    // Main lasso
    if(phase==='draw'&&!closedRef.current){
      isDrawingRef.current=true; pathRef.current=[[ix,iy]]
      setHint('Keep drawing… close the loop to finish'); render()
    }
  }

  const handleMouseMove=(e)=>{
    const[cx,cy]=getPos(e)
    mouseCanvasRef.current=[cx,cy]
    const[ix,iy]=toImage(cx,cy)
    const iw=imgRef.current?.naturalWidth??0,ih=imgRef.current?.naturalHeight??0
    hovToolRef.current=ix>=0&&iy>=0&&ix<iw&&iy<ih

    if(isPanningRef.current){
      const dx=e.clientX-lastMouseRef.current[0],dy=e.clientY-lastMouseRef.current[1]
      lastMouseRef.current=[e.clientX,e.clientY]
      panRef.current={x:panRef.current.x+dx,y:panRef.current.y+dy}
      render(); return
    }

    // Magnifier hover update for tools
    if(activeTool==='removeColor'||activeTool==='keepMarker'){render();/* fall through for keep */}

    // Keep lasso drawing
    if(isDrawingKeepRef.current&&activeTool==='keepMarker'){
      const kp=keepPathRef.current
      if(!kp.length)return
      const lastC=toCanvas(kp[kp.length-1][0],kp[kp.length-1][1])
      if(dist([cx,cy],lastC)<3)return
      // Check close
      if(kp.length>12&&dist([cx,cy],toCanvas(kp[0][0],kp[0][1]))<20){
        isDrawingKeepRef.current=false
        keepPathRef.current=[]
        setHint('Loop closed — area protected')
        onNewKeepLoop?.(kp)
        render(); return
      }
      keepPathRef.current=[...kp,[ix,iy]]; render(); return
    }

    if(!isDrawingRef.current||closedRef.current)return
    const pts=pathRef.current; if(!pts.length)return
    const lastC2=toCanvas(pts[pts.length-1][0],pts[pts.length-1][1])
    if(dist([cx,cy],lastC2)<4)return
    if(pts.length>12&&dist([cx,cy],toCanvas(pts[0][0],pts[0][1]))<22){closeLasso(pts);return}
    if(pts.length>5){
      const prev=toCanvas(pts[pts.length-1][0],pts[pts.length-1][1])
      for(let i=0;i<pts.length-3;i++){
        const a=toCanvas(pts[i][0],pts[i][1]),b=toCanvas(pts[i+1][0],pts[i+1][1])
        if(segsIntersect(a,b,prev,[cx,cy])){closeLasso(pts.slice(0,i+2));return}
      }
    }
    pathRef.current=[...pts,[ix,iy]]; render()
  }

  const handleMouseUp=()=>{isPanningRef.current=false}
  const handleMouseLeave=()=>{hovToolRef.current=false;render()}
  const handleWheel=(e)=>{e.preventDefault();const[mx,my]=getPos(e);applyZoom(zoomRef.current*(e.deltaY<0?1.12:1/1.12),mx,my)}

  useEffect(()=>{
    if(phase==='draw'){closedRef.current=false;pathRef.current=[];setClosed(false);keepPathRef.current=[];isDrawingKeepRef.current=false;setHint('Draw a freehand loop around any element');render()}
  },[phase,render])

  useEffect(()=>{
    if(!closedRef.current)return
    if(activeTool==='removeColor')setHint('Click anywhere on the image to remove that color region')
    else if(activeTool==='keepMarker')setHint('Draw a loop to protect area from Remove Color')
    else setHint('Selection locked — use tools in the right panel')
  },[activeTool])

  const cursor=(()=>{
    if(isPanningRef.current)return'grabbing'
    if(activeTool==='removeColor'&&closedRef.current)return'crosshair'
    if(activeTool==='keepMarker'&&closedRef.current)return'crosshair'
    if(phase==='draw'&&!closed)return'crosshair'
    return'default'
  })()

  return(
    <div className="canvas-wrapper">
      <div className="canvas-toolbar">
        <div className="toolbar-undo-group">
          <button className="toolbar-undo-btn" onClick={onUndo} disabled={!canUndo} title="Undo">↩</button>
          <button className="toolbar-undo-btn" onClick={onRedo} disabled={!canRedo} title="Redo">↪</button>
        </div>
        <span className="canvas-hint">{hint}</span>
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
}
