import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import MarketingLayout from '../components/MarketingLayout'
import { Helmet } from 'react-helmet-async'

import real_img01 from '../assets/real_img01.png'
import real_img02 from '../assets/real_img02.png'
import real_img02_sub_01 from '../assets/real_img02_sub_01.png'
import real_img02_sub_02 from '../assets/real_img02_sub_02.png'
import real_img01_sub_01 from '../assets/real_img01_sub_01.png'

import workflow01 from '../assets/workflow01.png'
import workflow02 from '../assets/workflow02.png'
import workflow03 from '../assets/workflow03.png'

export default function HowItWorks() {

  return (
    <MarketingLayout>
      <Helmet>
        <title>How It Works — SnapAsset Background Remover</title>

        <meta
          name="description"
          content="See exactly how SnapAsset removes product backgrounds in 4 steps: upload, 10-variant segmentation, Remove Color refinement, real-time enhancement, and PNG/JPG export."
        />

        <meta
          property="og:title"
          content="How It Works — SnapAsset Background Remover"
        />

        <meta
          property="og:description"
          content="Learn how SnapAsset transforms product photos with 10-variant segmentation, Remove Color refinement, real-time enhancements, and instant PNG or JPG export."
        />

        <meta
          property="og:url"
          content="https://snapasset.vercel.app/how-it-works"
        />

        <meta property="og:type" content="website" />

        <link
          rel="canonical"
          href="https://snapasset.vercel.app/how-it-works"
        />
      </Helmet>

      {/* ══════════════════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════════════════ */}
      <div className="mkt-hero-wrap">
        <div className="mkt-orb mkt-orb-1" aria-hidden="true" />
        <div className="mkt-orb mkt-orb-2" aria-hidden="true" />

        <div className="mkt-container mkt-hero-inner">
          <div className="mkt-badge">✨ Product Asset Creation, Simplified</div>

          <h1>
            Remove backgrounds<br />
            perfectly.{' '}
            <span className="mkt-grad-text">Every time.</span>
          </h1>

          <p className="lead">
            10 precision cutout variants, real-time Remove Color refinement, and a
            full enhancement canvas — all in one browser-based workflow. No account,
            no installs, no waiting.
          </p>

          <div className="mkt-btn-row">
            <Link to="/" className="mkt-btn-primary">
              Start Free →
            </Link>
            <a href="#demo" className="mkt-btn-ghost">
              See Demo ↓
            </a>
          </div>

          <div className="mkt-trust-row">
            <span>No sign-up required</span>
            <span>10 variants per image</span>
            <span>Instant results</span>
            <span>Free</span>
          </div>
        </div>
      </div>

      <hr className="mkt-hr" />

      {/* ══════════════════════════════════════════════════════════════════
          STEPS
      ══════════════════════════════════════════════════════════════════ */}
      <section className="mkt-sect" aria-labelledby="steps-heading">
        <div className="mkt-container">
          <div className="mkt-sect-hd">
            <h2 id="steps-heading">
              From upload to export{' '}
              <span className="mkt-grad-text">in under a minute</span>
            </h2>
            <p>
              A four-step workflow that gives you professional results without the
              usual trade-off between speed and precision.
            </p>
          </div>

          <div className="mkt-steps-grid">

            {/* Step 1 */}
            <article className="mkt-step-card mkt-glass">
              <div className="mkt-step-num" aria-hidden="true">1</div>
              <span className="mkt-step-emoji" aria-hidden="true">📸</span>
              <h3>Upload Your Image</h3>
              <p>
                Drop in any product photo — reflective surfaces, fine edges,
                complex overlapping parts, anything. SnapAsset accepts PNG, JPG,
                and WebP and handles the trickiest shots.
              </p>
              <div className="mkt-chips" aria-label="Supported subjects">
                <span className="mkt-chip">Headsets</span>
                <span className="mkt-chip">Jewellery</span>
                <span className="mkt-chip">Shoes</span>
                <span className="mkt-chip">Tyres</span>
                <span className="mkt-chip">Electronics</span>
                <span className="mkt-chip">Food</span>
              </div>
            </article>

            {/* Step 2 */}
            <article className="mkt-step-card mkt-glass">
              <div className="mkt-step-num" aria-hidden="true">2</div>
              <span className="mkt-step-emoji" aria-hidden="true">🎯</span>
              <h3>Select &amp; Refine</h3>
              <p>
                Draw a freehand lasso. SnapAsset instantly produces{' '}
                <strong style={{ color: '#c4b5fd' }}>10 different cutout variants</strong>{' '}
                side by side. Hover any card to see it live on the right canvas.
              </p>
              <ul>
                <li>
                  Activate <strong>Remove Color</strong> → cursor becomes a magnifier
                </li>
                <li>
                  Click once → <strong>seed flood</strong> removes that colour and
                  similar tones across all 10 variants instantly
                </li>
              </ul>
            </article>

            {/* Step 3 */}
            <article className="mkt-step-card mkt-glass">
              <div className="mkt-step-num" aria-hidden="true">3</div>
              <span className="mkt-step-emoji" aria-hidden="true">✨</span>
              <h3>Enhance in Real Time</h3>
              <p>
                Pick the best variant and polish it on the enhancement canvas.
                Everything updates live — no render delays.
              </p>
              <div className="mkt-chips" style={{ marginTop: '14px' }}>
                <span className="mkt-chip">Alpha Smooth Edges</span>
                <span className="mkt-chip">HD Quality</span>
                <span className="mkt-chip">Sharpen</span>
                <span className="mkt-chip">Vibrance</span>
                <span className="mkt-chip">Drop Shadow</span>
                <span className="mkt-chip">Gradients</span>
                <span className="mkt-chip">Eraser + Magnifier</span>
                <span className="mkt-chip">Global Undo / Redo</span>
              </div>
            </article>

            {/* Step 4 */}
            <article className="mkt-step-card mkt-glass">
              <div className="mkt-step-num" aria-hidden="true">4</div>
              <span className="mkt-step-emoji" aria-hidden="true">📦</span>
              <h3>Export &amp; Use</h3>
              <p>
                Download your finished asset as{' '}
                <strong style={{ color: '#c4b5fd' }}>PNG</strong> (with full
                transparency) or <strong style={{ color: '#c4b5fd' }}>JPG</strong> — ready
                for e-commerce listings, design handoffs, or development pipelines.
              </p>
            </article>

          </div>
        </div>
      </section>

      <hr className="mkt-hr" />
        <section className="mkt-sect" aria-labelledby="workflow-heading">
          <div className="mkt-container">

            <div className="mkt-sect-hd">
              <div className="mkt-badge">🖥 Inside the App</div>

              <h2 id="workflow-heading">
                The complete workflow in
                {' '}
                <span className="mkt-grad-text">three screens</span>
              </h2>

              <p>
                Upload your image, refine the extraction, and export the finished asset —
                all without leaving the browser.
              </p>
            </div>

            <div className="workflow-grid">

              <div className="workflow-card mkt-glass">
                <img src={workflow01} alt="Upload and selection interface" />

                <div className="workflow-info">
                  <span className="workflow-step">STEP 1</span>
                  <h3>Upload & Select</h3>
                  <p>Drop your image and outline the object you want to extract.</p>
                </div>
              </div>

              <div className="workflow-card mkt-glass">
                <img src={workflow02} alt="Segmentation variants and color removal tools" />

                <div className="workflow-info">
                  <span className="workflow-step">STEP 2</span>
                  <h3>Refine the Result</h3>
                  <p>Compare 10 variants and remove unwanted colours instantly.</p>
                </div>
              </div>

              <div className="workflow-card mkt-glass">
                <img src={workflow03} alt="Enhancement canvas and export controls" />

                <div className="workflow-info">
                  <span className="workflow-step">STEP 3</span>
                  <h3>Enhance & Export</h3>
                  <p>Adjust quality, shadows, backgrounds, then export PNG or JPG.</p>
                </div>
              </div>

            </div>

          </div>
        </section>

        <hr className="mkt-hr" />
      {/* ══════════════════════════════════════════════════════════════════
          DEMO  (user replaces placeholder comments with <img> tags)
      ══════════════════════════════════════════════════════════════════ */}
      <section id="demo" className="mkt-demo-sect" aria-labelledby="demo-heading">

        {/* Header inside container */}
        <div className="mkt-container">
          <div className="mkt-demo-hd">
            <div className="mkt-badge">🖼 Real Examples</div>
            <h2 id="demo-heading">
              See it in action
            </h2>
            <p>
              Side-by-side comparisons of the original photo and the extracted
              result — single-object and multi-object workflows.
            </p>
          </div>
        </div>

        {/* ── Example 1: Single object ─────────────────────────────── */}
        <div className="mkt-container">
          <div className="mkt-demo-example">
            <div className="mkt-demo-lbl">
              <span className="mkt-demo-lbl-num">1</span>
              Single Object Extraction
            </div>
          </div>
        </div>

        {/* Full-width scrollable row */}
        <div className="demo-scroll" style={{ padding: '0 40px' }} aria-label="Single object demo">
          <div className="demo-pair">

            {/* Left — original image */}
            <div className="demo-slot demo-slot-src">
                <img
                  src={real_img01}
                  alt="Original product photo with two objects"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                  }}
                />
              <div className="demo-corner-lbl">Original Image — with single asset</div>
            </div>

            {/* Right — extracted object (transparent bg) */}
            <div className="demo-slot demo-slot-out">
              <div className="demo-checker" aria-hidden="true" />
              <div className="demo-img-wrap">
                <img
                  src={real_img01_sub_01}
                  alt="Original product photo with two objects"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                  }}
                />
              </div>
              <div className="demo-corner-lbl">Extracted — Transparent Background</div>
            </div>

          </div>
        </div>

        {/* ── Example 2: Multi-object ──────────────────────────────── */}
        <div className="mkt-container" style={{ marginTop: '56px' }}>
          <div className="mkt-demo-example">
            <div className="mkt-demo-lbl">
              <span className="mkt-demo-lbl-num">2</span>
              Multi-Object Extraction
            </div>
          </div>
        </div>

        <div className="demo-scroll" style={{ padding: '0 40px' }} aria-label="Multi-object demo">
          <div className="demo-pair">

            {/* Left — original image */}
            <div className="demo-slot demo-slot-src">
                <img
                  src={real_img02}
                  alt="Original product photo with two objects"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                  }}
                />
              <div className="demo-corner-lbl">Original Image — with multiple assets</div>
            </div>

            {/* Right — two stacked extracted objects */}
            <div className="demo-stacked" aria-label="Two extracted objects stacked">

              {/* Object 1 */}
              <div className="demo-slot-half demo-slot-out">
                <div className="demo-checker" aria-hidden="true" />
                <div className="demo-img-wrap">
                  <img
                    src={real_img02_sub_01}
                    alt="Original product photo with two objects"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain'
                    }}
                  />
                </div>
                <div className="demo-corner-lbl">Object 1 — Extracted</div>
              </div>

              {/* Object 2 */}
              <div className="demo-slot-half demo-slot-out">
                <div className="demo-checker" aria-hidden="true" />
                <div className="demo-img-wrap">
                  <img
                    src={real_img02_sub_02}
                      alt="Original product photo with two objects"
                      style={{
                        paddingBottom: '10px',
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain'
                      }}
                  />
                </div>
                <div className="demo-corner-lbl">Object 2 — Extracted</div>
              </div>

            </div>
          </div>
        </div>
      </section>

      <hr className="mkt-hr" />

      {/* ══════════════════════════════════════════════════════════════════
          FEATURES
      ══════════════════════════════════════════════════════════════════ */}
      <section className="mkt-sect" aria-labelledby="features-heading">
        <div className="mkt-container">
          <div className="mkt-sect-hd">
            <h2 id="features-heading">
              Everything you need,{' '}
              <span className="mkt-grad-text">nothing you don't</span>
            </h2>
            <p>
              Every feature was added to solve a real frustration. Nothing is bloat.
            </p>
          </div>

          <div className="mkt-feat-grid">
            <article className="mkt-feat-card mkt-glass">
              <span className="mkt-feat-icon" aria-hidden="true">🔟</span>
              <h4>10 Simultaneous Variants</h4>
              <p>Never guess which cutout method works best — see all options at once and hover to preview in real time.</p>
            </article>
            <article className="mkt-feat-card mkt-glass">
              <span className="mkt-feat-icon" aria-hidden="true">🎨</span>
              <h4>Remove Color Tool</h4>
              <p>Seed flood algorithm eliminates unwanted colour regions instantly. One click cleans across all 10 variants simultaneously.</p>
            </article>
            <article className="mkt-feat-card mkt-glass">
              <span className="mkt-feat-icon" aria-hidden="true">🎚️</span>
              <h4>Live Enhancement Canvas</h4>
              <p>Sliders for contrast, vibrance, sharpness, HD quality, alpha edges, and opacity — every change renders in real time.</p>
            </article>
            <article className="mkt-feat-card mkt-glass">
              <span className="mkt-feat-icon" aria-hidden="true">🌑</span>
              <h4>Advanced Drop Shadows</h4>
              <p>Control position, spread, blur, colour, and opacity to produce realistic product shadows that match studio quality.</p>
            </article>
            <article className="mkt-feat-card mkt-glass">
              <span className="mkt-feat-icon" aria-hidden="true">↩️</span>
              <h4>Global Undo / Redo</h4>
              <p>Up to 40 history steps. Explore freely without fear — every action is reversible.</p>
            </article>
            <article className="mkt-feat-card mkt-glass">
              <span className="mkt-feat-icon" aria-hidden="true">🔍</span>
              <h4>Persistent Zoom &amp; Pan</h4>
              <p>Your view state never resets between edits. Work at pixel level without losing your place.</p>
            </article>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          FINAL CTA
      ══════════════════════════════════════════════════════════════════ */}
      <div className="mkt-final-cta">
        <h2>Ready to try it?</h2>
        <p>No account, no installs, no cost. Process your first image right now.</p>
        <Link to="/" className="mkt-btn-primary" style={{ display:'inline-flex', fontSize:'16px', padding:'15px 36px' }}>
          Open SnapAsset Free →
        </Link>
        <p className="note">No sign-up required · Works entirely in your browser · Free</p>
      </div>

    </MarketingLayout>
  )
}
