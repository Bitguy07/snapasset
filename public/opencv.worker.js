/**
 * opencv.worker.js
 * Web Worker — loads OpenCV.js (WASM) lazily, then handles:
 *   { type: 'segment', imageBuffer (ArrayBuffer), width, height, lasso_points }
 *   { type: 'refine',  imageBuffer, width, height, lasso_points,
 *                      remove_points, marker_strokes, marker_thickness }
 *   { type: 'enhance', imageBuffer, width, height }
 *
 * Mirrors the Python backend logic 1-to-1.
 * All cv.Mat objects are deleted after use to prevent WASM heap leaks.
 */

// ── OpenCV.js loader ─────────────────────────────────────────────────────────

let cvReady = false
let cvReadyPromise = null

function loadOpenCV() {
  if (cvReadyPromise) return cvReadyPromise
  cvReadyPromise = new Promise((resolve, reject) => {
    self.Module = {
      onRuntimeInitialized() {
        cvReady = true
        resolve()
      },
    }
    importScripts('https://cdn.jsdelivr.net/npm/opencv.js@1.2.1/opencv.js')
    setTimeout(() => {
      if (!cvReady) reject(new Error('OpenCV.js failed to initialize (timeout)'))
    }, 60000)
  })
  return cvReadyPromise
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = async (e) => {
  const { type, id } = e.data
  try {
    postMessage({ type: 'status', id, status: 'loading_cv' })
    await loadOpenCV()
    const cv = self.cv

    // imageBuffer is a transferred ArrayBuffer; reconstruct Uint8ClampedArray
    const imageData = e.data.imageBuffer
      ? new Uint8ClampedArray(e.data.imageBuffer)
      : null
    const { width, height } = e.data

    if (type === 'segment') {
      const results = runAllSegmentations(cv, imageData, width, height, e.data.lasso_points)
      postMessage({ type: 'segment_result', id, results })
    } else if (type === 'refine') {
      const results = runRefinedSegmentations(
        cv, imageData, width, height, e.data.lasso_points,
        e.data.remove_points || [], e.data.marker_strokes || [], e.data.marker_thickness || 10
      )
      postMessage({ type: 'refine_result', id, results })
    } else if (type === 'enhance') {
      const results = runAllEnhancements(cv, imageData, width, height)
      postMessage({ type: 'enhance_result', id, results })
    }
  } catch (err) {
    console.error('[worker]', err)
    postMessage({ type: 'error', id, message: String(err?.message || err) })
  }
}

// ── PNG encoder (no compression, store method) ────────────────────────────────
// Used because OffscreenCanvas.toDataURL is not available in workers.

function encodeRGBAasPNG(rgba, W, H) {
  function u32be(arr, off, v) {
    arr[off] = (v >>> 24) & 0xff; arr[off + 1] = (v >>> 16) & 0xff
    arr[off + 2] = (v >>> 8) & 0xff; arr[off + 3] = v & 0xff
  }
  const CRC_TABLE = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : (c >>> 1)
    CRC_TABLE[n] = c
  }
  function crc32(buf, start, len) {
    let c = 0xffffffff
    for (let i = start; i < start + len; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  function pngChunk(type, data) {
    const out = new Uint8Array(4 + 4 + data.length + 4)
    u32be(out, 0, data.length)
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
    out.set(data, 8)
    u32be(out, 8 + data.length, crc32(out, 4, 4 + data.length))
    return out
  }
  // IHDR
  const ihdr = new Uint8Array(13)
  u32be(ihdr, 0, W); u32be(ihdr, 4, H)
  ihdr[8] = 8; ihdr[9] = 6 // 8-bit RGBA (color type 6)

  // Raw scanlines with filter byte 0 (None)
  const rowBytes = W * 4
  const raw = new Uint8Array(H * (1 + rowBytes))
  for (let y = 0; y < H; y++) {
    raw[y * (1 + rowBytes)] = 0
    raw.set(rgba.subarray(y * rowBytes, y * rowBytes + rowBytes), y * (1 + rowBytes) + 1)
  }

  // Deflate store (no compression)
  const BSIZE = 32768
  const blocks = Math.ceil(raw.length / BSIZE) || 1
  const deflate = new Uint8Array(2 + blocks * (5 + BSIZE) + 4)
  let di = 0
  deflate[di++] = 0x78; deflate[di++] = 0x01
  for (let b = 0; b < blocks; b++) {
    const start = b * BSIZE, end = Math.min(start + BSIZE, raw.length)
    const blen = end - start, last = b === blocks - 1 ? 1 : 0
    deflate[di++] = last
    deflate[di++] = blen & 0xff; deflate[di++] = (blen >> 8) & 0xff
    deflate[di++] = (~blen) & 0xff; deflate[di++] = ((~blen) >> 8) & 0xff
    deflate.set(raw.subarray(start, end), di); di += blen
  }
  let s1 = 1, s2 = 0
  for (let i = 0; i < raw.length; i++) { s1 = (s1 + raw[i]) % 65521; s2 = (s2 + s1) % 65521 }
  deflate[di++] = (s2 >> 8) & 0xff; deflate[di++] = s2 & 0xff
  deflate[di++] = (s1 >> 8) & 0xff; deflate[di++] = s1 & 0xff

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const chunks = [sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflate.subarray(0, di)), pngChunk('IEND', new Uint8Array(0))]
  const total = chunks.reduce((a, c) => a + c.length, 0)
  const png = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { png.set(c, off); off += c.length }

  // Base64
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let b64 = ''
  for (let i = 0; i < png.length; i += 3) {
    const a = png[i], b = png[i + 1] ?? 0, c = png[i + 2] ?? 0
    b64 += CHARS[a >> 2] + CHARS[((a & 3) << 4) | (b >> 4)] +
      (i + 1 < png.length ? CHARS[((b & 15) << 2) | (c >> 6)] : '=') +
      (i + 2 < png.length ? CHARS[c & 63] : '=')
  }
  return 'data:image/png;base64,' + b64
}

// ── Core helpers ──────────────────────────────────────────────────────────────

/** RGBA Uint8ClampedArray → BGR cv.Mat. Caller must delete. */
function rgba2bgr(cv, imageData, W, H) {
  // Create RGBA mat by directly writing to WASM heap
  const src = new cv.Mat(H, W, cv.CV_8UC4)
  src.data.set(imageData)
  const bgr = new cv.Mat()
  cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR)
  src.delete()
  return bgr
}

/** RGBA Uint8ClampedArray → RGBA cv.Mat. Caller must delete. */
function rgba2rgbaMat(cv, imageData, W, H) {
  const mat = new cv.Mat(H, W, cv.CV_8UC4)
  mat.data.set(imageData)
  return mat
}

/** Compute padded bounding box. */
function cropInfoFromLasso(imgW, imgH, pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const pad = 15
  return {
    x1: Math.max(0, Math.floor(minX) - pad),
    y1: Math.max(0, Math.floor(minY) - pad),
    x2: Math.min(imgW, Math.ceil(maxX) + pad),
    y2: Math.min(imgH, Math.ceil(maxY) + pad),
  }
}

/** Crop src Mat to roi. Caller must delete. */
function cropMat(cv, src, x1, y1, x2, y2) {
  const rect = new cv.Rect(x1, y1, x2 - x1, y2 - y1)
  const roi = src.roi(rect)
  const out = new cv.Mat(); roi.copyTo(out); roi.delete()
  return out
}

/**
 * Build filled lasso polygon mask in crop coords.
 * Returns { lassoMask, cx, cy } — caller must delete lassoMask.
 */
function buildLassoMask(cv, W, H, lassoPoints, x1, y1) {
  const pts = new cv.Mat(lassoPoints.length, 1, cv.CV_32SC2)
  let sumX = 0, sumY = 0
  for (let i = 0; i < lassoPoints.length; i++) {
    const sx = Math.max(0, Math.min(W - 1, Math.round(lassoPoints[i][0] - x1)))
    const sy = Math.max(0, Math.min(H - 1, Math.round(lassoPoints[i][1] - y1)))
    pts.data32S[i * 2]     = sx
    pts.data32S[i * 2 + 1] = sy
    sumX += sx; sumY += sy
  }
  const lassoMask = cv.Mat.zeros(H, W, cv.CV_8UC1)
  const vec = new cv.MatVector(); vec.push_back(pts)
  // cv.fillPoly is not available in standard opencv.js, use cv.drawContours with thickness = -1 (filled)
  cv.drawContours(lassoMask, vec, 0, new cv.Scalar(255), -1)
  pts.delete(); vec.delete()
  const n = lassoPoints.length
  const cx = Math.max(0, Math.min(W - 1, Math.round(sumX / n)))
  const cy = Math.max(0, Math.min(H - 1, Math.round(sumY / n)))
  return { lassoMask, cx, cy }
}

/**
 * Build remove mask from click points using color-distance flood fill.
 * crop is BGR. Caller must delete returned mat.
 */
function buildRemoveMask(cv, crop, removePoints, x1, y1) {
  const H = crop.rows, W = crop.cols
  const removeMask = cv.Mat.zeros(H, W, cv.CV_8UC1)
  const cropData = crop.data // BGR flat array

  for (const rp of removePoints) {
    const rx = Math.max(0, Math.min(W - 1, Math.round(parseFloat(rp.x || 0) - x1)))
    const ry = Math.max(0, Math.min(H - 1, Math.round(parseFloat(rp.y || 0) - y1)))
    const tol = parseFloat(rp.tolerance || 30) * 3 // sum of abs diffs threshold

    // Sample seed color (BGR) from crop data
    const si = (ry * W + rx) * 3
    const seedB = cropData[si], seedG = cropData[si + 1], seedR = cropData[si + 2]

    // Build binary: pixels whose color-distance < tol → 255
    const binary = cv.Mat.zeros(H, W, cv.CV_8UC1)
    const binData = binary.data
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const idx = (r * W + c) * 3
        const d = Math.abs(cropData[idx] - seedB) + Math.abs(cropData[idx + 1] - seedG) + Math.abs(cropData[idx + 2] - seedR)
        if (d < tol) binData[r * W + c] = 255
      }
    }

    // Flood fill from seed (connected similar-color region only) in JavaScript
    if (binData[ry * W + rx] > 0) {
      // Iterative BFS flood fill
      const queue = [{x: rx, y: ry}]
      binData[ry * W + rx] = 128 // Mark as filled with 128
      
      const dx = [1, -1, 0, 0]
      const dy = [0, 0, 1, -1]
      
      let head = 0
      while (head < queue.length) {
        const curr = queue[head++]
        for (let i = 0; i < 4; i++) {
          const nx = curr.x + dx[i]
          const ny = curr.y + dy[i]
          if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
            const idx = ny * W + nx
            if (binData[idx] === 255) { // Unvisited matching pixel
              binData[idx] = 128
              queue.push({x: nx, y: ny})
            }
          }
        }
      }

      // Extract flood-filled (128) into removeMask
      const rmData = removeMask.data
      for (let i = 0; i < H * W; i++) {
        if (binData[i] === 128) rmData[i] = 255
      }
    }
    binary.delete()
  }
  return removeMask
}

/**
 * Build keep mask from marker strokes.
 * Caller must delete returned mat.
 */
function buildKeepMask(cv, H, W, markerStrokes, x1, y1, thickness) {
  const keepMask = cv.Mat.zeros(H, W, cv.CV_8UC1)
  for (const stroke of markerStrokes) {
    if (stroke.length < 2) continue
    for (let i = 0; i < stroke.length - 1; i++) {
      const sx0 = Math.max(0, Math.min(W - 1, Math.round(parseFloat(stroke[i][0]) - x1)))
      const sy0 = Math.max(0, Math.min(H - 1, Math.round(parseFloat(stroke[i][1]) - y1)))
      const sx1 = Math.max(0, Math.min(W - 1, Math.round(parseFloat(stroke[i + 1][0]) - x1)))
      const sy1 = Math.max(0, Math.min(H - 1, Math.round(parseFloat(stroke[i + 1][1]) - y1)))
      cv.line(keepMask, { x: sx0, y: sy0 }, { x: sx1, y: sy1 }, new cv.Scalar(255), Math.max(1, thickness))
    }
  }
  const kmData = keepMask.data
  let hasPixels = false
  for (let i = 0; i < kmData.length; i++) { if (kmData[i] > 0) { hasPixels = true; break } }
  if (hasPixels) {
    const k = Math.max(1, Math.floor(thickness / 2))
    const kernel = cv.Mat.ones(k, k, cv.CV_8UC1)
    cv.dilate(keepMask, keepMask, kernel); kernel.delete()
  }
  return keepMask
}

/**
 * Convert BGR crop Mat + alpha mask Mat → PNG data URL.
 * Applies light Gaussian blur on the alpha mask edge.
 */
function toDataUrl(cv, bgr, alphaMask) {
  const H = bgr.rows, W = bgr.cols
  const alphaBlurred = new cv.Mat()
  cv.GaussianBlur(alphaMask, alphaBlurred, new cv.Size(3, 3), 0)

  const bgrData = bgr.data
  const alphaData = alphaBlurred.data
  const rgba = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    // BGR → RGB
    rgba[i * 4]     = bgrData[i * 3 + 2]
    rgba[i * 4 + 1] = bgrData[i * 3 + 1]
    rgba[i * 4 + 2] = bgrData[i * 3]
    rgba[i * 4 + 3] = alphaData[i]
  }
  alphaBlurred.delete()
  return encodeRGBAasPNG(rgba, W, H)
}

/**
 * Common crop + mask preparation. Returns mats that MUST be deleted by caller:
 * crop, gray, hsv, lassoMask
 */
function prepareCrop(cv, imageData, imgW, imgH, lassoPoints) {
  const bgr = rgba2bgr(cv, imageData, imgW, imgH)
  const { x1, y1, x2, y2 } = cropInfoFromLasso(imgW, imgH, lassoPoints)
  const crop = cropMat(cv, bgr, x1, y1, x2, y2)
  bgr.delete()
  const W = crop.cols, H = crop.rows
  const gray = new cv.Mat()
  cv.cvtColor(crop, gray, cv.COLOR_BGR2GRAY)
  const hsv = new cv.Mat()
  cv.cvtColor(crop, hsv, cv.COLOR_BGR2HSV)
  const { lassoMask, cx, cy } = buildLassoMask(cv, W, H, lassoPoints, x1, y1)
  return { crop, gray, hsv, lassoMask, cx, cy, x1, y1, W, H }
}

// ── 10 Segmentation operations ────────────────────────────────────────────────

function opBinaryThreshold(cv, crop, gray, hsv, lassoMask, cx, cy) {
  const m = new cv.Mat()
  cv.threshold(gray, m, 30, 255, cv.THRESH_BINARY)
  const out = new cv.Mat()
  cv.bitwise_and(m, lassoMask, out)
  m.delete(); return out
}

function opOtsu(cv, crop, gray, hsv, lassoMask, cx, cy) {
  const m = new cv.Mat()
  cv.threshold(gray, m, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
  const out = new cv.Mat()
  cv.bitwise_and(m, lassoMask, out)
  m.delete(); return out
}

function opCannyOutline(cv, crop, gray, hsv, lassoMask, cx, cy) {
  const edges = new cv.Mat()
  cv.Canny(gray, edges, 40, 120)
  const kernel = cv.Mat.ones(2, 2, cv.CV_8UC1)
  cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 1)
  kernel.delete()
  const out = new cv.Mat()
  cv.bitwise_and(edges, lassoMask, out)
  edges.delete(); return out
}

function opCannyFilled(cv, crop, gray, hsv, lassoMask, cx, cy) {
  const H = gray.rows, W = gray.cols
  const edges = new cv.Mat()
  cv.Canny(gray, edges, 40, 120)
  const kernel = cv.Mat.ones(3, 3, cv.CV_8UC1)
  cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 2)
  kernel.delete()
  const interior = new cv.Mat()
  cv.bitwise_not(edges, interior)
  const seedX = Math.max(1, Math.min(W - 2, cx))
  const seedY = Math.max(1, Math.min(H - 2, cy))
  if (interior.data[seedY * W + seedX] > 128) {
    // Perform manual BFS flood fill on interior.data
    const intData = interior.data
    const queue = [{x: seedX, y: seedY}]
    intData[seedY * W + seedX] = 0 // fill with 0
    
    const dx = [1, -1, 0, 0]
    const dy = [0, 0, 1, -1]
    let head = 0
    while (head < queue.length) {
      const curr = queue[head++]
      for (let i = 0; i < 4; i++) {
        const nx = curr.x + dx[i]
        const ny = curr.y + dy[i]
        if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
          const idx = ny * W + nx
          if (intData[idx] > 128) {
            intData[idx] = 0
            queue.push({x: nx, y: ny})
          }
        }
      }
    }
  }
  const notInterior = new cv.Mat()
  cv.bitwise_not(interior, notInterior)
  const filled = new cv.Mat()
  cv.bitwise_or(notInterior, edges, filled)
  interior.delete(); notInterior.delete(); edges.delete()
  const out = new cv.Mat()
  cv.bitwise_and(filled, lassoMask, out)
  filled.delete(); return out
}

function opSaturationMask(cv, crop, gray, hsv, lassoMask, cx, cy) {
  const channels = new cv.MatVector()
  cv.split(hsv, channels)
  const s = channels.get(1)
  const m = new cv.Mat()
  cv.threshold(s, m, 50, 255, cv.THRESH_BINARY)
  const kernel = cv.Mat.ones(7, 7, cv.CV_8UC1)
  cv.morphologyEx(m, m, cv.MORPH_CLOSE, kernel)
  kernel.delete(); s.delete(); channels.delete()
  const out = new cv.Mat()
  cv.bitwise_and(m, lassoMask, out)
  m.delete(); return out
}

function opHueMatch(cv, crop, gray, hsv, lassoMask, cx, cy) {
  const H = gray.rows, W = gray.cols
  const cyC = Math.max(0, Math.min(H - 1, cy))
  const cxC = Math.max(0, Math.min(W - 1, cx))
  // HSV is 3-channel: index into flat data
  const hVal = hsv.data[(cyC * W + cxC) * 3]
  const rang = 18
  const lo = new cv.Mat(1, 1, cv.CV_8UC3)
  lo.data[0] = Math.max(0, hVal - rang); lo.data[1] = 40; lo.data[2] = 40
  const hi = new cv.Mat(1, 1, cv.CV_8UC3)
  hi.data[0] = Math.min(179, hVal + rang); hi.data[1] = 255; hi.data[2] = 255
  const loS = new cv.Scalar(lo.data[0], 40, 40)
  const hiS = new cv.Scalar(hi.data[0], 255, 255)
  lo.delete(); hi.delete()
  const m = new cv.Mat()
  cv.inRange(hsv, loS, hiS, m)
  const kernel = cv.Mat.ones(7, 7, cv.CV_8UC1)
  cv.morphologyEx(m, m, cv.MORPH_CLOSE, kernel)
  kernel.delete()
  const out = new cv.Mat()
  cv.bitwise_and(m, lassoMask, out)
  m.delete(); return out
}

function opGrabCut(cv, crop, gray, hsv, lassoMask, cx, cy) {
  const H = crop.rows, W = crop.cols
  if (W < 12 || H < 12) {
    const out = new cv.Mat(); lassoMask.copyTo(out); return out
  }
  const gc = cv.Mat.zeros(H, W, cv.CV_8UC1)
  const gcData = gc.data
  const lmData = lassoMask.data
  for (let i = 0; i < H * W; i++) { if (lmData[i] > 0) gcData[i] = 3 } // GC_PR_FGD

  const eroded = new cv.Mat()
  const eKernel = cv.Mat.ones(5, 5, cv.CV_8UC1)
  cv.erode(lassoMask, eroded, eKernel); eKernel.delete()
  const eroData = eroded.data
  for (let i = 0; i < H * W; i++) { if (eroData[i] > 0) gcData[i] = 1 } // GC_FGD
  eroded.delete()

  const bgdModel = new cv.Mat(), fgdModel = new cv.Mat()
  try {
    cv.grabCut(crop, gc, new cv.Rect(0, 0, W, H), bgdModel, fgdModel, 5, cv.GC_INIT_WITH_MASK)
  } catch (e) {
    bgdModel.delete(); fgdModel.delete(); gc.delete()
    const out = new cv.Mat(); lassoMask.copyTo(out); return out
  }
  const out = cv.Mat.zeros(H, W, cv.CV_8UC1)
  const outData = out.data
  for (let i = 0; i < H * W; i++) {
    const v = gcData[i]; if (v !== 0 && v !== 2) outData[i] = 255
  }
  bgdModel.delete(); fgdModel.delete(); gc.delete()
  return out
}

function opMorphClean(cv, crop, gray, hsv, lassoMask, cx, cy) {
  const m = new cv.Mat()
  cv.threshold(gray, m, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
  const kernel = cv.Mat.ones(5, 5, cv.CV_8UC1)
  cv.morphologyEx(m, m, cv.MORPH_OPEN, kernel)
  cv.morphologyEx(m, m, cv.MORPH_CLOSE, kernel)
  kernel.delete()
  const out = new cv.Mat()
  cv.bitwise_and(m, lassoMask, out)
  m.delete(); return out
}

function opLargestContour(cv, crop, gray, hsv, lassoMask, cx, cy) {
  const H = gray.rows, W = gray.cols
  const thresh = new cv.Mat()
  cv.threshold(gray, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU)
  const masked = new cv.Mat()
  cv.bitwise_and(thresh, lassoMask, masked)
  thresh.delete()
  const contours = new cv.MatVector(), hierarchy = new cv.Mat()
  cv.findContours(masked, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
  masked.delete(); hierarchy.delete()
  const m = cv.Mat.zeros(H, W, cv.CV_8UC1)
  if (contours.size() > 0) {
    let maxArea = 0, maxIdx = 0
    for (let i = 0; i < contours.size(); i++) {
      const a = cv.contourArea(contours.get(i)); if (a > maxArea) { maxArea = a; maxIdx = i }
    }
    const vec = new cv.MatVector(); vec.push_back(contours.get(maxIdx))
    // cv.fillPoly is not available in standard opencv.js, use cv.drawContours with thickness = -1 (filled)
    cv.drawContours(m, vec, 0, new cv.Scalar(255), -1); vec.delete()
  }
  contours.delete(); return m
}

function opInvertedOtsu(cv, crop, gray, hsv, lassoMask, cx, cy) {
  const m = new cv.Mat()
  cv.threshold(gray, m, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
  const out = new cv.Mat()
  cv.bitwise_and(m, lassoMask, out)
  m.delete(); return out
}

const SEGMENTATION_OPS = [
  { name: 'Binary Threshold', description: 'All pixels brighter than 30 — fills lit areas',            fn: opBinaryThreshold },
  { name: "Otsu's Method",    description: 'Auto optimal threshold — balanced separation',              fn: opOtsu },
  { name: 'Canny Outline',    description: 'Border lines only — hollow inside (line-art style)',        fn: opCannyOutline },
  { name: 'Canny + Filled',   description: 'Edges detected, interior flooded — solid filled shape',     fn: opCannyFilled },
  { name: 'Saturation Mask',  description: 'Isolates colorful pixels vs grey/dark background',          fn: opSaturationMask },
  { name: 'Hue Color Match',  description: 'Matches dominant hue sampled from lasso centre',            fn: opHueMatch },
  { name: 'GrabCut',          description: 'Graph-cut separates natural foreground/background',         fn: opGrabCut },
  { name: 'Morph Cleaned',    description: 'Otsu + open/close — removes noise, fills small holes',      fn: opMorphClean },
  { name: 'Largest Contour',  description: 'Fills the single biggest detected contour only',            fn: opLargestContour },
  { name: 'Inverted Otsu',    description: 'Opposite selection — reveals dark objects on light bg',     fn: opInvertedOtsu },
]

// ── Public segmentation entry points ─────────────────────────────────────────

function runAllSegmentations(cv, imageData, imgW, imgH, lassoPoints) {
  const { crop, gray, hsv, lassoMask, cx, cy } = prepareCrop(cv, imageData, imgW, imgH, lassoPoints)
  const results = []
  for (const { name, description, fn } of SEGMENTATION_OPS) {
    let mask = null
    try {
      mask = fn(cv, crop, gray, hsv, lassoMask, cx, cy)
      results.push({ name, description, image: toDataUrl(cv, crop, mask) })
    } catch (e) { console.error(`[seg] ${name}:`, e) }
    finally { if (mask) mask.delete() }
  }
  crop.delete(); gray.delete(); hsv.delete(); lassoMask.delete()
  return results
}

function runRefinedSegmentations(cv, imageData, imgW, imgH, lassoPoints, removePoints, markerStrokes, markerThickness) {
  const { crop, gray, hsv, lassoMask, cx, cy, x1, y1, W, H } = prepareCrop(cv, imageData, imgW, imgH, lassoPoints)
  const removeMask = buildRemoveMask(cv, crop, removePoints, x1, y1)
  const keepMask = buildKeepMask(cv, H, W, markerStrokes, x1, y1, markerThickness)

  const notRemove = new cv.Mat()
  cv.bitwise_not(removeMask, notRemove)
  const effectiveLasso = new cv.Mat()
  cv.bitwise_and(lassoMask, notRemove, effectiveLasso)
  notRemove.delete(); removeMask.delete()

  const keepData = keepMask.data
  let hasKeep = false
  for (let i = 0; i < keepData.length; i++) { if (keepData[i] > 0) { hasKeep = true; break } }

  const results = []
  for (const { name, description, fn } of SEGMENTATION_OPS) {
    let mask = null
    try {
      mask = fn(cv, crop, gray, hsv, effectiveLasso, cx, cy)
      if (hasKeep) {
        const keepInLasso = new cv.Mat()
        cv.bitwise_and(keepMask, lassoMask, keepInLasso)
        cv.bitwise_or(mask, keepInLasso, mask)
        keepInLasso.delete()
      }
      results.push({ name, description, image: toDataUrl(cv, crop, mask) })
    } catch (e) { console.error(`[refine] ${name}:`, e) }
    finally { if (mask) mask.delete() }
  }
  crop.delete(); gray.delete(); hsv.delete(); lassoMask.delete()
  effectiveLasso.delete(); keepMask.delete()
  return results
}

// ── 8 Enhancement operations ──────────────────────────────────────────────────

/** Load RGBA imageData into { rgb (CV_8UC3 in RGB order), alpha (CV_8UC1) }. Caller must delete both. */
function loadRGBA(cv, imageData, W, H) {
  // Split channels manually (faster than using matFromArray for large images)
  const rgb = new cv.Mat(H, W, cv.CV_8UC3)
  const alpha = new cv.Mat(H, W, cv.CV_8UC1)
  const rgbData = rgb.data, alphaData = alpha.data
  for (let i = 0; i < W * H; i++) {
    rgbData[i * 3]     = imageData[i * 4]     // R
    rgbData[i * 3 + 1] = imageData[i * 4 + 1] // G
    rgbData[i * 3 + 2] = imageData[i * 4 + 2] // B
    alphaData[i]       = imageData[i * 4 + 3]  // A
  }
  return { rgb, alpha }
}

/** Convert RGB Mat + alpha Mat → PNG data URL. */
function toDataUrlRGB(rgb, alpha) {
  const H = rgb.rows, W = rgb.cols
  const rgbData = rgb.data, alphaData = alpha.data
  const rgba = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4]     = rgbData[i * 3]
    rgba[i * 4 + 1] = rgbData[i * 3 + 1]
    rgba[i * 4 + 2] = rgbData[i * 3 + 2]
    rgba[i * 4 + 3] = alphaData[i]
  }
  return encodeRGBAasPNG(rgba, W, H)
}

function enhClean(cv, rgb, alpha) {
  const outAlpha = new cv.Mat()
  cv.GaussianBlur(alpha, outAlpha, new cv.Size(5, 5), 0)
  const outRgb = new cv.Mat(); rgb.copyTo(outRgb)
  return { rgb: outRgb, alpha: outAlpha }
}

function enhUnsharp(cv, rgb, alpha) {
  const blur = new cv.Mat()
  cv.GaussianBlur(rgb, blur, new cv.Size(0, 0), 3)
  // sharp = 1.8*rgb - 0.8*blur
  const sharp = new cv.Mat()
  cv.addWeighted(rgb, 1.8, blur, -0.8, 0, sharp)
  blur.delete()
  const outAlpha = new cv.Mat(); alpha.copyTo(outAlpha)
  return { rgb: sharp, alpha: outAlpha }
}

function enhContrastStretch(cv, rgb, alpha) {
  const out = new cv.Mat(); rgb.copyTo(out)
  const H = out.rows, W = out.cols
  const data = out.data, alphaData = alpha.data

  for (let c = 0; c < 3; c++) {
    let lo = 255, hi = 0
    for (let i = 0; i < H * W; i++) {
      if (alphaData[i] > 10) { const v = data[i * 3 + c]; if (v < lo) lo = v; if (v > hi) hi = v }
    }
    if (hi > lo) {
      const scale = 255 / (hi - lo)
      for (let i = 0; i < H * W; i++) data[i * 3 + c] = Math.min(255, Math.max(0, Math.round((data[i * 3 + c] - lo) * scale)))
    }
  }
  const outAlpha = new cv.Mat(); alpha.copyTo(outAlpha)
  return { rgb: out, alpha: outAlpha }
}

function enhHistogramEq(cv, rgb, alpha) {
  const out = new cv.Mat(); rgb.copyTo(out)
  const channels = new cv.MatVector()
  cv.split(out, channels)
  for (let c = 0; c < 3; c++) {
    const ch = channels.get(c); const eq = new cv.Mat()
    cv.equalizeHist(ch, eq); eq.copyTo(ch); eq.delete(); ch.delete()
  }
  cv.merge(channels, out); channels.delete()
  const outAlpha = new cv.Mat(); alpha.copyTo(outAlpha)
  return { rgb: out, alpha: outAlpha }
}

function enhVibrance(cv, rgb, alpha) {
  // RGB → BGR → HSV → boost S × 1.6 → BGR → RGB
  const bgr = new cv.Mat()
  cv.cvtColor(rgb, bgr, cv.COLOR_RGB2BGR)
  const hsv = new cv.Mat()
  cv.cvtColor(bgr, hsv, cv.COLOR_BGR2HSV)
  bgr.delete()
  const hsvData = hsv.data
  const N = hsv.rows * hsv.cols
  for (let i = 0; i < N; i++) hsvData[i * 3 + 1] = Math.min(255, Math.round(hsvData[i * 3 + 1] * 1.6))
  const bgr2 = new cv.Mat()
  cv.cvtColor(hsv, bgr2, cv.COLOR_HSV2BGR)
  hsv.delete()
  const outRgb = new cv.Mat()
  cv.cvtColor(bgr2, outRgb, cv.COLOR_BGR2RGB)
  bgr2.delete()
  const outAlpha = new cv.Mat(); alpha.copyTo(outAlpha)
  return { rgb: outRgb, alpha: outAlpha }
}

function enhEdgeGlow(cv, rgb, alpha) {
  const edges = new cv.Mat()
  cv.Canny(alpha, edges, 50, 150)
  const kernel = cv.Mat.ones(3, 3, cv.CV_8UC1)
  cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 2)
  kernel.delete()
  const glow = new cv.Mat()
  cv.GaussianBlur(edges, glow, new cv.Size(9, 9), 4)
  edges.delete()
  const outRgb = new cv.Mat(); rgb.copyTo(outRgb)
  const rgbData = outRgb.data, glowData = glow.data
  const N = outRgb.rows * outRgb.cols
  for (let i = 0; i < N; i++) {
    const g = glowData[i] / 255 * 90
    rgbData[i * 3]     = Math.min(255, Math.round(rgbData[i * 3]     + g))
    rgbData[i * 3 + 1] = Math.min(255, Math.round(rgbData[i * 3 + 1] + g))
    rgbData[i * 3 + 2] = Math.min(255, Math.round(rgbData[i * 3 + 2] + g))
  }
  glow.delete()
  const outAlpha = new cv.Mat(); alpha.copyTo(outAlpha)
  return { rgb: outRgb, alpha: outAlpha }
}

function enhSoftFeather(cv, rgb, alpha) {
  const outAlpha = new cv.Mat()
  cv.GaussianBlur(alpha, outAlpha, new cv.Size(15, 15), 0)
  const outRgb = new cv.Mat(); rgb.copyTo(outRgb)
  return { rgb: outRgb, alpha: outAlpha }
}

function enhGammaBrighten(cv, rgb, alpha) {
  const lut = new Uint8Array(256)
  for (let i = 0; i < 256; i++) lut[i] = Math.min(255, Math.round(Math.pow(i / 255, 1 / 1.5) * 255))
  const outRgb = new cv.Mat(); rgb.copyTo(outRgb)
  const data = outRgb.data
  for (let i = 0; i < data.length; i += 3) {
    data[i] = lut[data[i]]; data[i + 1] = lut[data[i + 1]]; data[i + 2] = lut[data[i + 2]]
  }
  const outAlpha = new cv.Mat(); alpha.copyTo(outAlpha)
  return { rgb: outRgb, alpha: outAlpha }
}

const ENHANCEMENT_OPS = [
  { name: 'Clean Extract',    description: 'Smooth alpha edges — best base for export',          fn: enhClean },
  { name: 'Unsharp Mask',     description: 'Sharpens detail — crispens edges',                   fn: enhUnsharp },
  { name: 'Contrast Stretch', description: 'Expands brightness range — brings out muted colour', fn: enhContrastStretch },
  { name: 'Histogram EQ',     description: 'Redistributes pixel brightness evenly',              fn: enhHistogramEq },
  { name: 'Vibrance Boost',   description: 'Saturation ×1.6 — vivid, punchy colours',            fn: enhVibrance },
  { name: 'Edge Glow',        description: 'Luminous border glow — UI highlight effect',         fn: enhEdgeGlow },
  { name: 'Soft Feather',     description: 'Wide faded edges — for overlay / sticker use',       fn: enhSoftFeather },
  { name: 'Gamma Brighten',   description: 'Power-law γ=1.5 — lifts dark areas',                 fn: enhGammaBrighten },
]

function runAllEnhancements(cv, imageData, W, H) {
  const { rgb, alpha } = loadRGBA(cv, imageData, W, H)
  const results = []
  for (const { name, description, fn } of ENHANCEMENT_OPS) {
    let outRgb = null, outAlpha = null
    try {
      const result = fn(cv, rgb, alpha)
      outRgb = result.rgb; outAlpha = result.alpha
      results.push({ name, description, image: toDataUrlRGB(outRgb, outAlpha) })
    } catch (e) { console.error(`[enh] ${name}:`, e) }
    finally { if (outRgb) outRgb.delete(); if (outAlpha) outAlpha.delete() }
  }
  rgb.delete(); alpha.delete()
  return results
}
