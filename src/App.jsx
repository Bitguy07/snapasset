import{useState,useCallback,useRef,useEffect,useMemo}from'react'
import{Link}from'react-router-dom'
import Canvas from'./components/Canvas'
import EnhancementCanvas from'./components/EnhancementCanvas'
import { Helmet } from 'react-helmet-async'

import'./App.css'

const PHASE_LABEL={idle:'Upload an image to start',draw:'Phase 1 — Draw lasso around element',loading:'Processing…',gallery1:'Phase 1 — Pick the best result',enhancing:'Phase 2 — Generating enhancements…',gallery2:'Phase 2 — Enhance & export'}

// ── Web Worker bridge ──────────────────────────────────────────────────────
// Sends a message to the OpenCV worker and returns a Promise that resolves
// when the matching response arrives. Each call gets a unique numeric id.
let _msgId = 0
function callWorker(worker, msg) {
  return new Promise((resolve, reject) => {
    const id = ++_msgId
    const handler = (e) => {
      const d = e.data
      if (d.id !== id) return
      if (d.type === 'error') { worker.removeEventListener('message', handler); reject(new Error(d.message)); return }
      if (d.type === 'status') return // loading_cv status — ignore
      worker.removeEventListener('message', handler)
      resolve(d)
    }
    worker.addEventListener('message', handler)
    // Transfer the imageData buffer (zero-copy) when present
    const { imageData, ...rest } = msg
    if (imageData) {
      // Convert Uint8ClampedArray -> ArrayBuffer for transfer
      const buf = imageData.buffer.slice(imageData.byteOffset, imageData.byteOffset + imageData.byteLength)
      worker.postMessage({ ...rest, id, imageBuffer: buf }, [buf])
    } else {
      worker.postMessage({ ...rest, id })
    }
  })
}

// Decode a data-URL or plain image src to { imageData (Uint8ClampedArray), width, height }
async function srcToImageData(src) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth; c.height = img.naturalHeight
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
      const id = ctx.getImageData(0, 0, c.width, c.height)
      resolve({ imageData: id.data, width: c.width, height: c.height })
    }
    img.src = src
  })
}

function ptInPoly(px,py,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];if((yi>py)!==(yj>py)&&px<(xj-xi)*(py-yi)/(yj-yi)+xi)inside=!inside}return inside}

// ─── Keep Mask (Problem 1) ─────────────────────────────────────────────────
function buildScanLineMask(loops,W,H){
  const mask=new Uint8Array(W*H)
  for(const loop of loops){
    if(loop.length<3)continue
    let mnY=H,mxY=0;for(const[,y]of loop){if(y<mnY)mnY=y;if(y>mxY)mxY=y}
    const n=loop.length
    for(let y=Math.max(0,Math.floor(mnY));y<=Math.min(H-1,Math.ceil(mxY));y++){
      const xs=[]
      for(let i=0;i<n;i++){const j=(i+1)%n,[x1,y1]=loop[i],[x2,y2]=loop[j];if((y1<=y&&y<y2)||(y2<=y&&y<y1))xs.push(x1+(y-y1)*(x2-x1)/(y2-y1))}
      xs.sort((a,b)=>a-b)
      for(let i=0;i+1<xs.length;i+=2)for(let x=Math.max(0,Math.floor(xs[i]));x<=Math.min(W-1,Math.ceil(xs[i+1]));x++)mask[y*W+x]=1
    }
  }
  return mask
}
function loadImg(src){return new Promise(r=>{if(!src)return r(null);const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src})}

// After backend refines, restore keep-loop pixels from preview image (Problem 1)
async function applyKeepMaskToResults(results,keepLoops,preserveUrl){
  if(!keepLoops.length||!preserveUrl||!results.length)return results
  const pi=await loadImg(preserveUrl);if(!pi)return results
  const W=pi.naturalWidth,H=pi.naturalHeight
  const pc=document.createElement('canvas');pc.width=W;pc.height=H
  const pctx=pc.getContext('2d');pctx.drawImage(pi,0,0)
  const pData=pctx.getImageData(0,0,W,H).data
  const keepMask=buildScanLineMask(keepLoops,W,H)
  return Promise.all(results.map(async item=>{
    const img=await loadImg(item.image);if(!img)return item
    const rW=img.naturalWidth,rH=img.naturalHeight
    const rc=document.createElement('canvas');rc.width=rW;rc.height=rH
    const rctx=rc.getContext('2d');rctx.drawImage(img,0,0)
    const rId=rctx.getImageData(0,0,rW,rH),out=rId.data
    const sx=W/rW,sy=H/rH
    for(let y=0;y<rH;y++)for(let x=0;x<rW;x++){
      const px=Math.min(W-1,Math.round(x*sx)),py=Math.min(H-1,Math.round(y*sy))
      if(keepMask[py*W+px]&&pData[(py*W+px)*4+3]>30){
        const ri=(y*rW+x)*4,pi2=(py*W+px)*4
        out[ri]=pData[pi2];out[ri+1]=pData[pi2+1];out[ri+2]=pData[pi2+2];out[ri+3]=pData[pi2+3]
      }
    }
    rctx.putImageData(new ImageData(out,rW,rH),0,0)
    return{...item,image:rc.toDataURL()}
  }))
}

async function computeLoopIntersection(loops,previewUrl){
  if(!loops.length||!previewUrl)return[]
  return new Promise(resolve=>{
    const img=new Image();img.onload=()=>{
      const W=img.naturalWidth,H=img.naturalHeight
      const c=document.createElement('canvas');c.width=W;c.height=H
      const ctx=c.getContext('2d');ctx.drawImage(img,0,0)
      const{data}=ctx.getImageData(0,0,W,H)
      const keepMask=buildScanLineMask(loops,W,H)
      const pts=[]
      const step=Math.max(3,Math.floor(Math.min(W,H)/60))
      for(let y=0;y<H;y+=step)for(let x=0;x<W;x+=step)if(keepMask[y*W+x]&&data[(y*W+x)*4+3]>30)pts.push([x,y])
      resolve(pts)
    };img.onerror=()=>resolve([]);img.src=previewUrl
  })
}

// ─── Gradient helpers (Problem 3) ─────────────────────────────────────────
function interpolateHex(h1,h2,t){
  const r1=parseInt(h1.slice(1,3),16),g1=parseInt(h1.slice(3,5),16),b1=parseInt(h1.slice(5,7),16)
  const r2=parseInt(h2.slice(1,3),16),g2=parseInt(h2.slice(3,5),16),b2=parseInt(h2.slice(5,7),16)
  return'#'+[r1+(r2-r1)*t,g1+(g2-g1)*t,b1+(b2-b1)*t].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('')
}
let _stopId=100
function newStopId(){return++_stopId}

// ─── SLIDER ────────────────────────────────────────────────────────────────
function Slider({label,value,min=0,max=100,step=1,onChange,unit='%'}){
  const trackRef=useRef(null),drag=useRef(false)
  const calc=(cx)=>{const r=trackRef.current.getBoundingClientRect(),p=Math.max(0,Math.min(1,(cx-r.left)/r.width));return Math.min(max,Math.max(min,Math.round((min+p*(max-min))/step)*step))}
  const pct=((value-min)/(max-min))*100
  return(
    <div className="ctrl-row">
      <div className="ctrl-label-row">
        {label&&<span className="ctrl-label">{label}</span>}
        <span className="ctrl-value">{value}{unit}</span>
      </div>
      <div ref={trackRef} className="slider-track"
        onPointerDown={e=>{drag.current=true;e.currentTarget.setPointerCapture(e.pointerId);onChange(calc(e.clientX))}}
        onPointerMove={e=>{if(drag.current)onChange(calc(e.clientX))}}
        onPointerUp={()=>{drag.current=false}} onPointerCancel={()=>{drag.current=false}}>
        <div className="slider-fill" style={{width:`${pct}%`}}/>
        <div className="slider-thumb" style={{left:`${pct}%`}}/>
      </div>
    </div>
  )
}

// ─── FIGMA COLOR PICKER (Problems 2) ──────────────────────────────────────
function hexToHsv(hex){
  const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0
  const s=mx?d/mx:0,v=mx
  if(d){if(mx===r)h=60*(((g-b)/d+6)%6);else if(mx===g)h=60*((b-r)/d+2);else h=60*((r-g)/d+4)}
  return[Math.round(h),Math.round(s*100),Math.round(v*100)]
}
function hsvToHex(h,s,v){
  s/=100;v/=100;const C=v*s,X=C*(1-Math.abs((h/60)%2-1)),m=v-C;let r,g,b
  if(h<60){r=C;g=X;b=0}else if(h<120){r=X;g=C;b=0}else if(h<180){r=0;g=C;b=X}
  else if(h<240){r=0;g=X;b=C}else if(h<300){r=X;g=0;b=C}else{r=C;g=0;b=X}
  return'#'+[r+m,g+m,b+m].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('')
}

// Problem 2: pointer-events fix on bars via CSS — see App.css
function GradBar({gradient,value,min,max,onChange,thumbColor,checkerBg}){
  const ref=useRef(null),drag=useRef(false)
  const calc=(cx)=>{const r=ref.current.getBoundingClientRect();return Math.round(min+Math.max(0,Math.min(1,(cx-r.left)/r.width))*(max-min))}
  const pct=((value-min)/(max-min))*100
  return(
    <div ref={ref} className="figma-bar" style={{backgroundImage:checkerBg?undefined:gradient}}
      onPointerDown={e=>{drag.current=true;e.currentTarget.setPointerCapture(e.pointerId);e.stopPropagation();onChange(calc(e.clientX))}}
      onPointerMove={e=>{if(drag.current){e.stopPropagation();onChange(calc(e.clientX))}}}
      onPointerUp={e=>{drag.current=false;e.stopPropagation()}}
      onPointerCancel={()=>{drag.current=false}}>
      {checkerBg&&<div className="figma-checker" style={{background:gradient}}/>}
      <div className="figma-bar-thumb" style={{left:`${pct}%`,background:thumbColor||'#fff'}}/>
    </div>
  )
}

function FigmaColorPicker({color,onChange,alpha=100,onAlphaChange}){
  const safe=/^#[0-9a-f]{6}$/i.test(color)?color:'#6366f1'
  const[hsv,setHsv]=useState(()=>hexToHsv(safe))
  const[localAlpha,setLocalAlpha]=useState(alpha)
  const[hexTxt,setHexTxt]=useState(safe.slice(1).toUpperCase())
  const svRef=useRef(null),svDrag=useRef(false)
  useEffect(()=>{const s=/^#[0-9a-f]{6}$/i.test(color)?color:'#6366f1';setHsv(hexToHsv(s));setHexTxt(s.slice(1).toUpperCase())},[color])
  useEffect(()=>{setLocalAlpha(alpha)},[alpha])
  useEffect(()=>{
    const c=svRef.current;if(!c)return
    const dpr=window.devicePixelRatio||1;c.width=240*dpr;c.height=210*dpr
    const ctx=c.getContext('2d');ctx.scale(dpr,dpr)
    const hueHex=hsvToHex(hsv[0],100,100)
    
    // Saturation and Value gradients
    const gH=ctx.createLinearGradient(0,0,240,0);gH.addColorStop(0,'#fff');gH.addColorStop(1,hueHex)
    ctx.fillStyle=gH;ctx.fillRect(0,0,240,210)
    const gV=ctx.createLinearGradient(0,0,0,210);gV.addColorStop(0,'rgba(0,0,0,0)');gV.addColorStop(1,'rgba(0,0,0,1)')
    ctx.fillStyle=gV;ctx.fillRect(0,0,240,210)
  },[hsv[0]])
  const svPos=(e)=>{const r=svRef.current.getBoundingClientRect();return[Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*100),Math.round(Math.max(0,Math.min(1,1-(e.clientY-r.top)/r.height))*100)]}
  const apply=(h,s,v)=>{setHsv([h,s,v]);const hx=hsvToHex(h,s,v);setHexTxt(hx.slice(1).toUpperCase());onChange(hx)}
  const curColor=hsvToHex(hsv[0],hsv[1],hsv[2])
  const[cr,cg,cb]=[parseInt(curColor.slice(1,3),16),parseInt(curColor.slice(3,5),16),parseInt(curColor.slice(5,7),16)]
  return(
    <div className="figma-picker" onPointerDown={e=>e.stopPropagation()}>
      <div className="figma-sv-wrap" style={{height:'210px'}}>
        <canvas ref={svRef} style={{width:'100%',height:'210px',display:'block',cursor:'crosshair',borderRadius:'8px 8px 0 0'}}
          onPointerDown={e=>{svDrag.current=true;e.currentTarget.setPointerCapture(e.pointerId);const[s,v]=svPos(e);apply(hsv[0],s,v)}}
          onPointerMove={e=>{if(!svDrag.current)return;const[s,v]=svPos(e);apply(hsv[0],s,v)}}
          onPointerUp={()=>{svDrag.current=false}} onPointerCancel={()=>{svDrag.current=false}}/>
        <div className="figma-sv-cursor" style={{left:`${hsv[1]}%`,top:`${100-hsv[2]}%`,background:curColor}}/>
      </div>
      <div className="figma-bars-row" style={{padding:'14px 14px 8px',gap:'12px',alignItems:'center'}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:12}}>
          <GradBar gradient="linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)"
            value={hsv[0]} min={0} max={360} thumbColor={hsvToHex(hsv[0],100,100)} onChange={h=>apply(h,hsv[1],hsv[2])}/>
          <GradBar gradient={`linear-gradient(to right,rgba(${cr},${cg},${cb},0),rgb(${cr},${cg},${cb}))`}
            value={localAlpha} min={0} max={100} thumbColor={curColor} checkerBg={true}
            onChange={v=>{setLocalAlpha(v);onAlphaChange?.(v)}}/>
        </div>
      </div>
      <div className="figma-inputs-row" style={{padding:'4px 12px 12px',display:'flex',alignItems:'center',gap:'6px'}}>
        <div className="figma-hex-group" style={{flex:1,display:'flex',flexDirection:'row',alignItems:'center',gap:'4px',padding:'6px 6px',borderRadius:'6px',background:'#15151f',border:'1px solid #2d2d3d'}}>
          <select value="Hex" disabled style={{background:'transparent',border:'none',outline:'none',color:'#a1a1aa',fontSize:'11px',cursor:'default',paddingRight:0,marginRight:0}}>
            <option>Hex</option>
          </select>
          <input className="figma-hex-input" value={hexTxt}
            onChange={e=>{const v=e.target.value.replace('#','').toUpperCase();setHexTxt(v);if(/^[0-9A-F]{6}$/i.test(v))apply(...hexToHsv('#'+v))}}
            spellCheck={false} maxLength={6} style={{width:'54px',background:'transparent',border:'none',outline:'none',color:'#fff',fontFamily:'monospace',fontSize:'11px',textAlign:'left',marginLeft:0,paddingLeft:0}}/>
        </div>
        <div className="figma-alpha-group" style={{width:'58px',display:'flex',flexDirection:'row',alignItems:'center',gap:'1px',padding:'6px 6px',borderRadius:'6px',background:'#15151f',border:'1px solid #2d2d3d',flexShrink:0}}>
          <input className="figma-alpha-num" type="number" value={localAlpha} min={0} max={100}
            onChange={e=>{const v=Math.max(0,Math.min(100,parseInt(e.target.value)||0));setLocalAlpha(v);onAlphaChange?.(v)}}
            style={{width:'28px',background:'transparent',border:'none',outline:'none',color:'#fff',fontSize:'11px',textAlign:'right',padding:0,margin:0}}/>
          <span className="figma-input-label" style={{color:'#71717a',fontSize:'11px',paddingLeft:'1px',flexShrink:0}}>%</span>
        </div>
      </div>
    </div>
  )
}

function ColorPickerBtn({color,onChange,label,alpha,onAlphaChange}){
  const[open,setOpen]=useState(false)
  const[popStyle,setPopStyle]=useState({})
  const wrapRef=useRef(null)
  useEffect(()=>{
    if(!open)return
    const h=(e)=>{if(!wrapRef.current?.contains(e.target))setOpen(false)}
    document.addEventListener('pointerdown',h,true);return()=>document.removeEventListener('pointerdown',h,true)
  },[open])
  const handleOpen=()=>{
    if(!open&&wrapRef.current){
      const panel=wrapRef.current.closest('.right-panel,.enh-panel')
      const pr=panel?panel.getBoundingClientRect():wrapRef.current.getBoundingClientRect()
      const wr=wrapRef.current.getBoundingClientRect()
      setPopStyle({position:'fixed',right:`${window.innerWidth-pr.left+8}px`,top:`${Math.min(wr.top,window.innerHeight-430)}px`})
    }
    setOpen(o=>!o)
  }
  return(
    <div className="ctrl-row color-picker-wrap" ref={wrapRef}>
      <div className="ctrl-label-row">
        {label&&<span className="ctrl-label">{label}</span>}
        <div className="color-swatch-btn" style={{background:color}} onClick={handleOpen}/>
      </div>
      {open&&<div className="figma-picker-popover" style={popStyle}><FigmaColorPicker color={color} onChange={onChange} alpha={alpha??100} onAlphaChange={onAlphaChange}/></div>}
    </div>
  )
}

// ─── GRADIENT EDITOR (Problem 3: sorted, stable IDs, interpolated, clamped) ─
function GradientEditor({stops,angle,onStopsChange,onAngleChange}){
  // Always sort by position for correct CSS and display (Problem 3ii+iii)
  const sorted=useMemo(()=>[...stops].sort((a,b)=>a.pos-b.pos),[stops])
  const css=sorted.length>1
    ?`linear-gradient(${angle}deg,${sorted.map(s=>`${s.color} ${s.pos}%`).join(',')})`
    :sorted[0]?.color||'#333'

  const updateStop=(id,key,val)=>onStopsChange(stops.map(s=>s.id===id?{...s,[key]:val}:s))

  const addStop=()=>{
    // Find the largest gap, place new stop at midpoint with interpolated color (Problem 3iv)
    let insertPos=50,color='#aaaaaa'
    if(sorted.length>=2){
      let maxGap=0
      for(let i=0;i<sorted.length-1;i++){
        const gap=sorted[i+1].pos-sorted[i].pos
        if(gap>maxGap){maxGap=gap;insertPos=Math.round((sorted[i].pos+sorted[i+1].pos)/2);color=interpolateHex(sorted[i].color,sorted[i+1].color,0.5)}
      }
    } else if(sorted.length===1){
      insertPos=sorted[0].pos<50?Math.min(99,sorted[0].pos+30):Math.max(1,sorted[0].pos-30)
    }
    onStopsChange([...stops,{pos:insertPos,color,id:newStopId()}])
  }

  return(
    <div className="grad-editor">
      <div className="grad-preview" style={{background:css}}/>
      <Slider label="Angle" value={angle} min={0} max={360} onChange={onAngleChange} unit="°"/>
      {/* Render sorted for visual consistency, key by stable id (Problem 3iii) */}
      {sorted.map(s=>(
        <div key={s.id} className="grad-stop-row">
          <div className="grad-stop-slider">
            <Slider value={s.pos} min={0} max={100} step={1} onChange={v=>updateStop(s.id,'pos',v)} unit="%"/>
          </div>
          <ColorPickerBtn color={s.color} onChange={c=>updateStop(s.id,'color',c)}/>
          {stops.length>1&&<button className="stop-del" onClick={()=>onStopsChange(stops.filter(st=>st.id!==s.id))}>×</button>}
        </div>
      ))}
      <button className="btn-add-stop" onClick={addStop}>+ Add stop</button>
    </div>
  )
}

// ─── FLOATING PREVIEW ─────────────────────────────────────────────────────
function FloatingPreview({image,bgSettings,open,onToggle}){
  const PW=276,PH=330
  const bgStyle=bgSettings?.type==='solid'?{background:bgSettings.color}
    :bgSettings?.type==='gradient'&&bgSettings.gradStops?.length>1
      ?{background:`linear-gradient(${bgSettings.gradAngle??135}deg,${[...bgSettings.gradStops].sort((a,b)=>a.pos-b.pos).map(s=>`${s.color} ${s.pos}%`).join(',')})`}:{}
  return(
    <div className="floating-preview-root">
      <button className="fp-toggle" onClick={onToggle}>{open?'▲ PREVIEW':'▼ PREVIEW'}</button>
      {open&&(
        <div className="fp-card" style={{width:PW}}>
          <div className="fp-header"><span className="fp-label">PREVIEW</span></div>
          {image?(
            <div className="fp-img-area" style={{...bgStyle,width:PW,height:PH}}>
              <div className="checker-bg"/>
              <img src={image} alt="preview" className="fp-img"/>
            </div>
          ):<div className="fp-empty" style={{width:PW,height:PH}}><span>Hover a card to preview</span></div>}
        </div>
      )}
    </div>
  )
}

function ConfirmModal({message,onConfirm,onCancel}){
  return(
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" onClick={e=>e.stopPropagation()}>
        <div className="modal-msg">{message}</div>
        <div className="modal-btns">
          <button className="modal-btn cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-btn confirm" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

function SelectionToolsSection({activeTool,onToolChange,removeColorTolerance,setRemoveColorTolerance,keepLoops,onRemoveLoop,isRefining}){
  return(
    <div className="panel-section">
      <div className="panel-title">SELECTION TOOLS</div>
      <div className="tool-btns">
        <button className={`tool-btn ${activeTool==='removeColor'?'active-red':''}`} onClick={()=>onToolChange(activeTool==='removeColor'?'none':'removeColor')}>
          <span>🎯</span> Remove Color
        </button>
        {/* <button className={`tool-btn ${activeTool==='keepMarker'?'active-green':''}`} onClick={()=>onToolChange(activeTool==='keepMarker'?'none':'keepMarker')}>
          <span>🔒</span> Keep Marker
        </button> */}
      </div>
      {activeTool==='removeColor'&&<div className="tool-settings"><div className="tool-hint">Click any area to remove that color region</div><Slider label="Tolerance" value={removeColorTolerance} min={5} max={80} step={1} onChange={setRemoveColorTolerance} unit=""/></div>}
      {activeTool==='keepMarker'&&<div className="tool-settings">
        <div className="tool-hint">Prevent this area from removing by Remove Color</div>
        {keepLoops.length>0&&<div className="loop-badges-list" style={{display:'flex',flexDirection:'column',gap:'4px',marginTop:'6px'}}>
          {keepLoops.map((loop,idx)=>(
            <div key={idx} className="badge green" style={{display:'flex',alignItems:'center',justifySegment:'space-between',justifyContent:'space-between',borderRadius:'5px',padding:'4px 8px',width:'100%',fontFamily:'monospace'}}>
              <span>Loop {idx+1}</span>
              <button onClick={()=>onRemoveLoop(idx)} style={{background:'transparent',border:'none',color:'#fca5a5',fontSize:'12px',cursor:'pointer',fontWeight:'bold',padding:'0 2px'}}>×</button>
            </div>
          ))}
        </div>}
      </div>}
      {isRefining&&<div className="refining-badge"><div className="mini-spinner"/> Updating…</div>}
    </div>
  )
}

// Default gradient stops with stable IDs
const DEF_BG_STOPS=[{pos:0,color:'#7735CB',id:1},{pos:100,color:'#3B7BA7',id:2}]
const DEF_OV_STOPS=[{pos:0,color:'#7735CB',id:3},{pos:100,color:'#3B7BA7',id:4}]

export default function App(){
  const workerRef=useRef(null)
  useEffect(()=>{
    const w=new Worker('/opencv.worker.js')
    workerRef.current=w
    return()=>w.terminate()
  },[])
  const[phase,setPhase]=useState('idle')
  const[imageFile,setImageFile]=useState(null)
  const[segResults,setSegResults]=useState([])
  const[enhResults,setEnhResults]=useState([])
  const[error,setError]=useState(null)
  const[lastHoveredImage,setLastHoveredImage]=useState(null)
  const[activeCardIdx,setActiveCardIdx]=useState(0)
  const[previewOpen,setPreviewOpen]=useState(true)
  const[activeTool,setActiveTool]=useState('none')
  const[removeColorTolerance,setRemoveColorTolerance]=useState(30)
  const[removePoints,setRemovePoints]=useState([])
  const[keepLoops,setKeepLoops]=useState([])
  const[keepPoints,setKeepPoints]=useState([])
  const[lassoPoints,setLassoPoints]=useState([])
  const[isRefining,setIsRefining]=useState(false)
  const[selectedSegImage,setSelectedSegImage]=useState(null)
  const[enhParams,setEnhParams]=useState({brightness:50,contrast:50,saturation:50,sharpness:0,alphaSmooth:20,gamma:50,opacity:100,hd:0})
  const[bgSettings,setBgSettings]=useState({type:'none',color:'#ffffff',gradStops:DEF_BG_STOPS,gradAngle:135})
  const[shadowSettings,setShadowSettings]=useState({enabled:false,x:5,y:10,blur:20,color:'#000000',opacity:60})
  const[colorOverlay,setColorOverlay]=useState({enabled:false,type:'solid',color:'#4466ff',opacity:30,gradStops:DEF_OV_STOPS,gradAngle:135})
  const[eraserActive,setEraserActive]=useState(false)
  const[eraserThickness,setEraserThickness]=useState(20)
  const[eraseStrokes,setEraseStrokes]=useState([])
  const[floodEraseAreas,setFloodEraseAreas]=useState([])
  const[undoStack,setUndoStack]=useState([])
  const[redoStack,setRedoStack]=useState([])
  const[confirmModal,setConfirmModal]=useState(null)
  const enhCanvasRef=useRef(null)

  // ── Warn before reload/close when user has an active image session ──────────
  useEffect(()=>{
    const guard=(e)=>{
      if(phase==='idle')return
      e.preventDefault()
      e.returnValue=''   // required by Chrome to show the native dialog
    }
    window.addEventListener('beforeunload',guard)
    return()=>window.removeEventListener('beforeunload',guard)
  },[phase])

  const handleToolChange=useCallback((tool)=>{if(tool!=='none')setEraserActive(false);setActiveTool(tool)},[])
  const handleEraserToggle=useCallback((active)=>{if(active)setActiveTool('none');setEraserActive(active)},[])

  const pushUndo=useCallback((snap)=>{setUndoStack(s=>[...s.slice(-40),snap]);setRedoStack([])},[])
  const applySnapshot=useCallback((snap)=>{
    if(snap.eraseStrokes!==undefined)setEraseStrokes(snap.eraseStrokes)
    if(snap.floodEraseAreas!==undefined)setFloodEraseAreas(snap.floodEraseAreas)
    if(snap.removePoints!==undefined)setRemovePoints(snap.removePoints)
    if(snap.keepLoops!==undefined)setKeepLoops(snap.keepLoops)
    if(snap.keepPoints!==undefined)setKeepPoints(snap.keepPoints)
    if(snap.enhParams!==undefined)setEnhParams(snap.enhParams)
    if(snap.selectedSegImage!==undefined)setSelectedSegImage(snap.selectedSegImage)
    if(snap.activeCardIdx!==undefined)setActiveCardIdx(snap.activeCardIdx)
    if(snap.lastHoveredImage!==undefined)setLastHoveredImage(snap.lastHoveredImage)
  },[])
  const handleUndo=useCallback(()=>{setUndoStack(s=>{if(!s.length)return s;const prev=s[s.length-1];setRedoStack(r=>[...r,{eraseStrokes,floodEraseAreas,removePoints,keepLoops,keepPoints,enhParams,selectedSegImage,activeCardIdx,lastHoveredImage}]);applySnapshot(prev);return s.slice(0,-1)})},[eraseStrokes,floodEraseAreas,removePoints,keepLoops,keepPoints,enhParams,selectedSegImage,activeCardIdx,lastHoveredImage,applySnapshot])
  const handleRedo=useCallback(()=>{setRedoStack(r=>{if(!r.length)return r;const next=r[r.length-1];setUndoStack(s=>[...s,{eraseStrokes,floodEraseAreas,removePoints,keepLoops,keepPoints,enhParams,selectedSegImage,activeCardIdx,lastHoveredImage}]);applySnapshot(next);return r.slice(0,-1)})},[eraseStrokes,floodEraseAreas,removePoints,keepLoops,keepPoints,enhParams,selectedSegImage,activeCardIdx,lastHoveredImage,applySnapshot])

  function handleFile(file){
    if(!file||!file.type.startsWith('image/'))return
    setError(null);setSegResults([]);setEnhResults([]);setRemovePoints([]);setKeepLoops([]);setKeepPoints([])
    setLassoPoints([]);setActiveTool('none');setEraserActive(false);setEraseStrokes([]);setFloodEraseAreas([])
    setLastHoveredImage(null);setActiveCardIdx(0);setUndoStack([]);setRedoStack([])
    setImageFile(file);setPhase('draw')
  }

  const handleLassoClosed=useCallback(async(pts)=>{
    setLassoPoints(pts);setPhase('loading');setError(null)
    try{
      const src=URL.createObjectURL(imageFile)
      const{imageData,width,height}=await srcToImageData(src)
      URL.revokeObjectURL(src)
      const data=await callWorker(workerRef.current,{type:'segment',imageData,width,height,lasso_points:pts})
      setSegResults(data.results)
      if(data.results?.length>0){setLastHoveredImage(data.results[0].image);setActiveCardIdx(0)}
      setPhase('gallery1')
    }catch(err){setError(`Segmentation failed: ${err.message}`);setPhase('draw')}
  },[imageFile])

  // Capture preview BEFORE refine, then restore keep pixels after
  const runRefine=useCallback(async(rPts,kPts,_loops,preserveImage)=>{
    if(!lassoPoints.length||!imageFile)return
    setIsRefining(true)
    try{
      const src=URL.createObjectURL(imageFile)
      const{imageData,width,height}=await srcToImageData(src)
      URL.revokeObjectURL(src)
      const marker_strokes=kPts&&kPts.length>0?[kPts]:[]
      const data=await callWorker(workerRef.current,{
        type:'refine',imageData,width,height,
        lasso_points:lassoPoints,remove_points:rPts,
        marker_strokes,marker_thickness:10
      })
      let results=data.results
      // Post-process: restore keep-loop pixels (client-side keep mask logic)
      const loops=_loops||keepLoops
      if(loops.length>0&&preserveImage){
        results=await applyKeepMaskToResults(results,loops,preserveImage)
      }
      setSegResults(results)
      if(results?.length>0)setLastHoveredImage(results[activeCardIdx]?.image||results[0].image)
    }catch(err){setError(`Refinement failed: ${err.message}`)}
    setIsRefining(false)
  },[lassoPoints,imageFile,activeCardIdx,keepLoops])

  const handleRemoveClick=useCallback((pt)=>{
    const preserveImage=lastHoveredImage  // capture current preview
    pushUndo({removePoints,keepLoops,keepPoints})
    const newPts=[...removePoints,pt];setRemovePoints(newPts)
    runRefine(newPts,keepPoints,keepLoops,preserveImage)
  },[removePoints,keepLoops,keepPoints,lastHoveredImage,runRefine,pushUndo])

  const handleRemoveLoop=useCallback(async(idx)=>{
    pushUndo({keepLoops,keepPoints})
    const newLoops=keepLoops.filter((_,i)=>i!==idx)
    setKeepLoops(newLoops)
    const computed=await computeLoopIntersection(newLoops,lastHoveredImage)
    setKeepPoints(computed)
    runRefine(removePoints,computed,newLoops,lastHoveredImage)
  },[keepLoops,keepPoints,removePoints,lastHoveredImage,runRefine,pushUndo])

  const handleNewKeepLoop=useCallback(async(loop)=>{
    pushUndo({keepLoops,keepPoints})
    const newLoops=[...keepLoops,loop];setKeepLoops(newLoops)
    const computed=await computeLoopIntersection(newLoops,lastHoveredImage)
    setKeepPoints(computed)
    runRefine(removePoints,computed,newLoops,lastHoveredImage)
  },[keepLoops,keepPoints,removePoints,lastHoveredImage,runRefine,pushUndo])

  async function handleSegSelect(item){
    setActiveTool('none');setEraserActive(false)
    setSelectedSegImage(item.image);setPhase('enhancing');setError(null)
    setLastHoveredImage(item.image)
    setUndoStack([]);setRedoStack([])
    try{
      const{imageData,width,height}=await srcToImageData(item.image)
      const data=await callWorker(workerRef.current,{type:'enhance',imageData,width,height})
      setEnhResults(data.results)
      if(data.results?.length>0){setSelectedSegImage(data.results[0].image);setLastHoveredImage(data.results[0].image);setActiveCardIdx(0)}
      setPhase('gallery2')
    }catch(err){setError(`Enhancement failed: ${err.message}`);setPhase('gallery1')}
  }

  const handleEnhCardClick=(item,i)=>{
    pushUndo({selectedSegImage,activeCardIdx,lastHoveredImage,eraseStrokes,floodEraseAreas})
    setSelectedSegImage(item.image);setActiveCardIdx(i);setLastHoveredImage(item.image)
    setEraseStrokes([]);setFloodEraseAreas([])
  }
  const handleNewFloodErase=useCallback((area)=>{pushUndo({floodEraseAreas});setFloodEraseAreas(a=>[...a,area])},[floodEraseAreas,pushUndo])
  const setEnh=(key,val)=>{pushUndo({enhParams});setEnhParams(p=>({...p,[key]:val}))}

  async function handleExport(format){
    try{
      const ec=await enhCanvasRef.current?.getExportCanvas();if(!ec)return
      ec.toBlob(b=>{if(!b)return;const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`snapasset.${format}`;a.click();URL.revokeObjectURL(a.href)},format==='jpg'?'image/jpeg':'image/png',0.95)
    }catch(e){console.error('Export failed',e)}
  }

  function handleResetClick(){setConfirmModal({message:'Start over with a new image?',onConfirm:()=>{doReset();setConfirmModal(null)}})}
  function doReset(){
    setPhase('idle');setImageFile(null);setSegResults([]);setEnhResults([]);setSelectedSegImage(null)
    setRemovePoints([]);setKeepLoops([]);setKeepPoints([]);setLassoPoints([])
    setActiveTool('none');setEraserActive(false);setEraseStrokes([]);setFloodEraseAreas([])
    setUndoStack([]);setRedoStack([]);setError(null);setLastHoveredImage(null);setActiveCardIdx(0);setPreviewOpen(true)
  }
  function handleReuseClick(){
    setPhase('draw');setSegResults([]);setEnhResults([]);setSelectedSegImage(null)
    setRemovePoints([]);setKeepLoops([]);setKeepPoints([]);setLassoPoints([])
    setActiveTool('none');setEraserActive(false);setEraseStrokes([]);setFloodEraseAreas([])
    setUndoStack([]);setRedoStack([]);setLastHoveredImage(null);setActiveCardIdx(0)
  }

  const showPreview=phase==='gallery1'||phase==='gallery2'
  const showReuseBtn=imageFile&&!['idle','draw'].includes(phase)

  return(
    <>
      <Helmet>
        <title>
          SnapAsset — Background Remover for Pixel-Perfect Product Images
        </title>

        <meta
          name="description"
          content="Create pixel-perfect product images with SnapAsset. Generate 10 background removal variants, refine selections with Remove Color, enhance images in real time, and export high-quality PNG or JPG assets."
        />

        <meta
          property="og:title"
          content="SnapAsset — Background Remover for Pixel-Perfect Product Images"
        />

        <meta
          property="og:description"
          content="Create studio-quality product assets with 10 background removal variants, advanced refinement tools, real-time enhancements, and flexible export options."
        />

        <meta
          property="og:url"
          content="https://snapasset.vercel.app/"
        />

        <meta property="og:type" content="website" />

        <link
          rel="canonical"
          href="https://snapasset.vercel.app/"
        />
      </Helmet>

    <div className="app">
      <header className="topbar">
        <span className="topbar-logo">SnapAsset</span>

        {(!showReuseBtn && phase === 'idle') ? (
          <nav className="topbar-nav" aria-label="Main navigation">
            <Link to="/how-it-works" className="topbar-nav-link">
              How It Works
            </Link>

            <Link to="/about" className="topbar-nav-link">
              About
            </Link>

            <Link to="/comparison" className="topbar-nav-link">
              Compare
            </Link>
          </nav>
        ) : (
          <>
            <span className="topbar-phase">
              {PHASE_LABEL[phase] || ''}
            </span>

            {showReuseBtn && (
              <button className="btn-reuse" onClick={handleReuseClick}>
                ↩ Reuse
              </button>
            )}

            {phase !== 'idle' && (
              <button className="btn-new-img" onClick={handleResetClick}>
                ✦ New Image
              </button>
            )}
          </>
        )}
      </header>
      {error&&<div className="error-banner">{error}</div>}
      <div className="body-layout">
        <div className="canvas-col">
          {phase==='idle'&&(
            <div className="upload-zone" onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0])}} onDragOver={e=>e.preventDefault()} onClick={()=>document.getElementById('fi').click()}>
              <div className="upload-icon">⬆</div><p className="upload-title">Drop an image here</p>
              <p className="upload-sub">or click to browse — PNG, JPG, WebP</p>
              <input id="fi" type="file" accept="image/*" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
            </div>
          )}
          {showPreview&&<FloatingPreview image={lastHoveredImage} bgSettings={bgSettings} open={previewOpen} onToggle={()=>setPreviewOpen(o=>!o)}/>}
          {['draw','loading','gallery1'].includes(phase)&&imageFile&&(
            <Canvas imageFile={imageFile} onLassoClosed={handleLassoClosed} phase={phase}
              activeTool={activeTool} removeColorTolerance={removeColorTolerance}
              onRemoveClick={handleRemoveClick} removePoints={removePoints}
              onNewKeepLoop={handleNewKeepLoop} keepLoops={keepLoops}
              onUndo={handleUndo} onRedo={handleRedo} canUndo={undoStack.length>0} canRedo={redoStack.length>0}/>
          )}
          {['enhancing','gallery2'].includes(phase)&&selectedSegImage&&(
            <EnhancementCanvas ref={enhCanvasRef} baseImage={selectedSegImage}
              enhParams={enhParams} bgSettings={bgSettings} shadowSettings={shadowSettings}
              colorOverlay={colorOverlay} eraserActive={eraserActive} eraserThickness={eraserThickness}
              eraseStrokes={eraseStrokes} onNewEraseStroke={s=>{pushUndo({eraseStrokes});setEraseStrokes(a=>[...a,s])}}
              floodEraseAreas={floodEraseAreas} onNewFloodErase={handleNewFloodErase}
              activeTool={activeTool} removeColorTolerance={removeColorTolerance}
              keepLoops={keepLoops} onNewKeepLoop={loop=>{pushUndo({keepLoops});setKeepLoops(a=>[...a,loop])}}
              onUndo={handleUndo} onRedo={handleRedo} canUndo={undoStack.length>0} canRedo={redoStack.length>0}/>
          )}
          {(phase==='loading'||phase==='enhancing')&&(
            <div className="spinner-overlay"><div className="spinner"/>
              <p>{phase==='loading'?'Running segmentation…':'Running enhancement…'}</p></div>
          )}
          {phase==='gallery1'&&segResults.length>0&&(
            <div className="gallery-strip">
              <div className="gallery-header"><span className="gallery-title">SEGMENTATION RESULTS — CLICK THE BEST ONE</span>
                {isRefining&&<span className="refining-inline"><span className="mini-spinner"/> updating…</span>}</div>
              <div className="gallery-grid">
                {segResults.map((item,i)=>(
                  <div key={i} className={`gallery-card ${activeCardIdx===i?'gallery-card-active':''}`}
                    onMouseEnter={()=>{setLastHoveredImage(item.image);setActiveCardIdx(i)}}
                    onClick={()=>handleSegSelect(item)}>
                    <div className="gallery-img-wrap"><img src={item.image} alt={item.name} className="gallery-img"/></div>
                    <span className="gallery-name">{item.name}</span><span className="gallery-desc">{item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {phase==='gallery2'&&enhResults.length>0&&(
            <div className="gallery-strip">
              <div className="gallery-header"><span className="gallery-title">ENHANCEMENT RESULTS — CLICK TO APPLY BASE</span></div>
              <div className="gallery-grid">
                {enhResults.map((item,i)=>(
                  <div key={i} className={`gallery-card ${activeCardIdx===i?'gallery-card-active':''}`}
                    onMouseEnter={()=>{setLastHoveredImage(item.image);setActiveCardIdx(i)}}
                    onClick={()=>handleEnhCardClick(item,i)}>
                    <div className="gallery-img-wrap"><img src={item.image} alt={item.name} className="gallery-img"/></div>
                    <span className="gallery-name">{item.name}</span><span className="gallery-desc">{item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {phase==='gallery1'&&(
          <div className="right-panel">
            <SelectionToolsSection activeTool={activeTool} onToolChange={handleToolChange}
              removeColorTolerance={removeColorTolerance} setRemoveColorTolerance={setRemoveColorTolerance}
              keepLoops={keepLoops} onRemoveLoop={handleRemoveLoop} isRefining={isRefining}/>
            {(removePoints.length>0||keepLoops.length>0)&&(
              <div className="panel-section">
                <div className="panel-title">ACTIVE REFINEMENTS</div>
                <div className="refine-status">
                  {removePoints.length>0&&<span className="badge red">{removePoints.length} remove pts</span>}
                  {keepLoops.length>0&&<span className="badge green">{keepLoops.length} keep loops</span>}
                </div>
                <button className="btn-clear" onClick={()=>{pushUndo({removePoints,keepLoops,keepPoints});setRemovePoints([]);setKeepLoops([]);setKeepPoints([]);runRefine([],[],[],lastHoveredImage)}}>Clear all</button>
              </div>
            )}
          </div>
        )}

        {phase==='gallery2'&&(
          <div className="right-panel enh-panel">
            <SelectionToolsSection activeTool={activeTool} onToolChange={handleToolChange}
              removeColorTolerance={removeColorTolerance} setRemoveColorTolerance={setRemoveColorTolerance}
              keepLoops={keepLoops} onRemoveLoop={handleRemoveLoop} isRefining={false}/>
            <div className="panel-section">
              <div className="panel-title">ADJUSTMENTS</div>
              <Slider label="Brightness" value={enhParams.brightness} onChange={v=>setEnh('brightness',v)}/>
              <Slider label="Contrast"   value={enhParams.contrast}   onChange={v=>setEnh('contrast',v)}/>
              <Slider label="Saturation" value={enhParams.saturation} onChange={v=>setEnh('saturation',v)}/>
              <Slider label="Sharpness"  value={enhParams.sharpness}  onChange={v=>setEnh('sharpness',v)}/>
              <Slider label="Alpha Smooth" value={enhParams.alphaSmooth} onChange={v=>setEnh('alphaSmooth',v)}/>
              <Slider label="Gamma"      value={enhParams.gamma}      onChange={v=>setEnh('gamma',v)}/>
              <Slider label="Opacity"    value={enhParams.opacity}    onChange={v=>setEnh('opacity',v)}/>
              <Slider label="HD Enhance" value={enhParams.hd}         onChange={v=>setEnh('hd',v)}/>
            </div>
            <div className="panel-section">
              <div className="panel-title">COLOR OVERLAY</div>
              <label className="toggle-row"><input type="checkbox" checked={colorOverlay.enabled} onChange={e=>setColorOverlay(c=>({...c,enabled:e.target.checked}))}/><span>Enable overlay</span></label>
              {colorOverlay.enabled&&(<>
                <div className="type-tabs">
                  <button className={`type-tab ${colorOverlay.type==='solid'?'active':''}`} onClick={()=>setColorOverlay(c=>({...c,type:'solid'}))}>Solid</button>
                  <button className={`type-tab ${colorOverlay.type==='gradient'?'active':''}`} onClick={()=>setColorOverlay(c=>({...c,type:'gradient'}))}>Gradient</button>
                </div>
                {colorOverlay.type==='solid'
                  ?<ColorPickerBtn label="Overlay color" color={colorOverlay.color} onChange={c=>setColorOverlay(o=>({...o,color:c}))} alpha={colorOverlay.opacity} onAlphaChange={v=>setColorOverlay(o=>({...o,opacity:v}))}/>
                  :<GradientEditor stops={colorOverlay.gradStops} angle={colorOverlay.gradAngle} onStopsChange={s=>setColorOverlay(c=>({...c,gradStops:s}))} onAngleChange={a=>setColorOverlay(c=>({...c,gradAngle:a}))}/>}
                {colorOverlay.type==='solid'&&<Slider label="Overlay opacity" value={colorOverlay.opacity} onChange={v=>setColorOverlay(c=>({...c,opacity:v}))}/>}
              </>)}
            </div>
            <div className="panel-section">
              <div className="panel-title">BACKGROUND</div>
              <div className="type-tabs">
                {['none','solid','gradient'].map(t=><button key={t} className={`type-tab ${bgSettings.type===t?'active':''}`} onClick={()=>setBgSettings(b=>({...b,type:t}))}>{t}</button>)}
              </div>
              {bgSettings.type==='solid'&&<ColorPickerBtn label="BG color" color={bgSettings.color} onChange={c=>setBgSettings(b=>({...b,color:c}))}/>}
              {bgSettings.type==='gradient'&&<GradientEditor stops={bgSettings.gradStops} angle={bgSettings.gradAngle} onStopsChange={s=>setBgSettings(b=>({...b,gradStops:s}))} onAngleChange={a=>setBgSettings(b=>({...b,gradAngle:a}))}/>}
            </div>
            <div className="panel-section">
              <div className="panel-title">DROP SHADOW</div>
              <label className="toggle-row"><input type="checkbox" checked={shadowSettings.enabled} onChange={e=>setShadowSettings(s=>({...s,enabled:e.target.checked}))}/><span>Enable shadow</span></label>
              {shadowSettings.enabled&&(<>
                <Slider label="Offset X" value={shadowSettings.x} min={-60} max={60} onChange={v=>setShadowSettings(s=>({...s,x:v}))} unit="px"/>
                <Slider label="Offset Y" value={shadowSettings.y} min={-60} max={60} onChange={v=>setShadowSettings(s=>({...s,y:v}))} unit="px"/>
                <Slider label="Blur" value={shadowSettings.blur} min={0} max={80} onChange={v=>setShadowSettings(s=>({...s,blur:v}))} unit="px"/>
                <Slider label="Opacity" value={shadowSettings.opacity} onChange={v=>setShadowSettings(s=>({...s,opacity:v}))}/>
                <ColorPickerBtn label="Shadow color" color={shadowSettings.color} onChange={c=>setShadowSettings(s=>({...s,color:c}))} alpha={shadowSettings.opacity} onAlphaChange={v=>setShadowSettings(s=>({...s,opacity:v}))}/>
              </>)}
            </div>
            <div className="panel-section">
              <div className="panel-title">ERASER</div>
              <label className="toggle-row"><input type="checkbox" checked={eraserActive} onChange={e=>handleEraserToggle(e.target.checked)}/><span>Eraser tool</span></label>
              {eraserActive&&(<><Slider label="Size" value={eraserThickness} min={4} max={120} onChange={setEraserThickness} unit="px"/><div className="tool-hint">Hold &amp; drag to erase softly</div></>)}
              {eraseStrokes.length>0&&<button className="btn-clear" onClick={()=>{pushUndo({eraseStrokes});setEraseStrokes([])}}>Clear erases</button>}
              {floodEraseAreas.length>0&&<button className="btn-clear" onClick={()=>{pushUndo({floodEraseAreas});setFloodEraseAreas([])}}>Clear flood erases</button>}
            </div>
            <div className="panel-section">
              <div className="panel-title">EXPORT</div>
              <div className="export-btns">
                <button className="export-btn" onClick={()=>handleExport('png')}>⬇ PNG</button>
                <button className="export-btn" onClick={()=>handleExport('jpg')}>⬇ JPG</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {confirmModal&&<ConfirmModal message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={()=>setConfirmModal(null)}/>}

      {/* ── Floating footer — hidden once an image is loaded ─────────────── */}
      {phase==='idle'&&(
        <footer className="bottombar" aria-label="Site footer">
          <span className="bottombar-made">Made By Mohd Yunus &nbsp;·&nbsp; <a href="mailto:mryunus2849855@gmail.com" className="bottombar-email">mryunus2849855@gmail.com</a></span>
          <nav className="bottombar-nav" aria-label="Footer navigation">
            <Link to="/how-it-works" className="bottombar-nav-link">How It Works</Link>
            <Link to="/about" className="bottombar-nav-link">About</Link>
            <Link to="/comparison" className="bottombar-nav-link">Compare</Link>
          </nav>
          <a href="https://digitalheroesco.com" target="_blank" rel="noopener noreferrer" className="bottombar-dh-btn">
            Built for Digital Heroes
          </a>
        </footer>
      )}
    </div>
    </>
  )
}
