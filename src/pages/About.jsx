import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import MarketingLayout from '../components/MarketingLayout'
import { Helmet } from 'react-helmet-async'


export default function About() {

  return (
    <MarketingLayout>

      <Helmet>
        <title>About SnapAsset — Built for Pixel-Perfect Product Assets</title>

        <meta
          name="description"
          content="Learn why SnapAsset was created to eliminate the trade-off between fast but imprecise background removal tools and powerful but time-consuming editors."
        />

        <meta
          property="og:title"
          content="About SnapAsset — Built for Pixel-Perfect Product Assets"
        />

        <meta
          property="og:description"
          content="Discover the story behind SnapAsset and how it helps designers and e-commerce teams achieve both speed and precision in product image workflows."
        />

        <meta
          property="og:url"
          content="https://snapasset.vercel.app/about"
        />

        <meta property="og:type" content="website" />

        <link
          rel="canonical"
          href="https://snapasset.vercel.app/about"
        />
      </Helmet>

      {/* ══════════════════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════════════════ */}
      <div className="mkt-hero-wrap">
        <div className="mkt-orb mkt-orb-1" aria-hidden="true" />
        <div className="mkt-orb mkt-orb-2" aria-hidden="true" />

        <div className="mkt-container mkt-hero-inner">
          <div className="mkt-badge">💜 Our Story</div>

          <h1>
            Built for creators who{' '}
            <span className="mkt-grad-text">refuse to compromise</span>
          </h1>

          <p className="lead">
            Existing tools force you to choose between speed and precision.
            SnapAsset was built to give you both — in one workflow, with no
            interruptions.
          </p>

          <div className="mkt-btn-row">
            <Link to="/" className="mkt-btn-primary">Try It Free →</Link>
            <Link to="/how-it-works" className="mkt-btn-ghost">How It Works →</Link>
          </div>
        </div>
      </div>

      <hr className="mkt-hr" />

      {/* ══════════════════════════════════════════════════════════════════
          STORY
      ══════════════════════════════════════════════════════════════════ */}
      <section className="mkt-sect" aria-labelledby="story-heading">
        <div className="mkt-container">
          <div className="mkt-sect-hd">
            <h2 id="story-heading">The problem we set out to solve</h2>
          </div>

          <div className="mkt-story">
            <p>
              Every background removal tool we tried made the same trade-off. The
              automatic ones were fast but left ragged edges on headsets, rings, and
              anything with fine detail or transparency. The manual ones gave you
              full control but ate up hours per image.
            </p>
            <p>
              There was no middle ground. You either accepted mediocre cutouts or
              spent hours cleaning them up in Photoshop. Neither was acceptable for
              teams shipping dozens of product images a day.
            </p>
            <p>
              So we built <strong>SnapAsset</strong> — a tool that runs{' '}
              <strong>10 segmentation variants in parallel</strong>, lets you instantly
              pick the best starting point, and then gives you precise{' '}
              <strong>real-time tools</strong> to clean up exactly what needs cleaning.
              No more re-running the entire process. No more switching tools. One
              workflow, start to finish.
            </p>
          </div>
        </div>
      </section>

      <hr className="mkt-hr" />

      {/* ══════════════════════════════════════════════════════════════════
          DIFFERENTIATORS
      ══════════════════════════════════════════════════════════════════ */}
      <section className="mkt-sect" aria-labelledby="diff-heading">
        <div className="mkt-container">
          <div className="mkt-sect-hd">
            <h2 id="diff-heading">
              What makes SnapAsset{' '}
              <span className="mkt-grad-text">different</span>
            </h2>
            <p>
              Every design decision came from a real frustration with existing tools.
            </p>
          </div>

          <div className="mkt-diff-grid">
            <div className="mkt-diff-card mkt-glass">
              <span className="mkt-diff-icon" aria-hidden="true">🔟</span>
              <h4>10 Simultaneous Variants</h4>
              <p>See all cutout options at once and hover to preview. No waiting between attempts — pick the best and keep moving.</p>
            </div>
            <div className="mkt-diff-card mkt-glass">
              <span className="mkt-diff-icon" aria-hidden="true">🎨</span>
              <h4>Remove Color Tool</h4>
              <p>Seed flood removal targets colour regions with a magnifier. One click, real-time updates across all 10 variants.</p>
            </div>
            <div className="mkt-diff-card mkt-glass">
              <span className="mkt-diff-icon" aria-hidden="true">🎚️</span>
              <h4>Real-time Enhancement Canvas</h4>
              <p>Brightness, contrast, vibrance, sharpness, HD quality, alpha smoothing — every slider updates instantly, no lag.</p>
            </div>
            <div className="mkt-diff-card mkt-glass">
              <span className="mkt-diff-icon" aria-hidden="true">🌑</span>
              <h4>Advanced Drop Shadows</h4>
              <p>Offset, blur, colour, and opacity controls create realistic product shadows that look studio-quality.</p>
            </div>
            <div className="mkt-diff-card mkt-glass">
              <span className="mkt-diff-icon" aria-hidden="true">↩️</span>
              <h4>Global Undo / Redo</h4>
              <p>40-step history that spans all operations. Explore edits freely knowing you can always go back.</p>
            </div>
            <div className="mkt-diff-card mkt-glass">
              <span className="mkt-diff-icon" aria-hidden="true">🔍</span>
              <h4>Persistent Zoom &amp; Pan</h4>
              <p>Your view state never resets. Work at pixel level on fine edges without losing your position between steps.</p>
            </div>
          </div>
        </div>
      </section>

      <hr className="mkt-hr" />

      {/* ══════════════════════════════════════════════════════════════════
          WHO IT'S FOR
      ══════════════════════════════════════════════════════════════════ */}
      <section className="mkt-sect" aria-labelledby="for-heading">
        <div className="mkt-container">
          <div className="mkt-sect-hd">
            <h2 id="for-heading">Made for people who ship daily</h2>
          </div>
          <div className="mkt-story">
            <p>
              SnapAsset is built for{' '}
              <strong>designers, developers, and e-commerce teams</strong> who can't
              afford to spend 20 minutes per image. Whether you're a solo creator
              producing 10 product listings a week or an agency processing hundreds
              of shots, SnapAsset gets out of your way and gets the result done.
            </p>
            <p>
              We removed SVG export after thorough testing because high-quality PNG
              and JPG consistently produce better visual results for real product
              photography. Every decision is deliberate and grounded in practice, not
              feature-count.
            </p>
          </div>
        </div>
      </section>

      <hr className="mkt-hr" />

      {/* ══════════════════════════════════════════════════════════════════
          ATTRIBUTION
      ══════════════════════════════════════════════════════════════════ */}
      <section className="mkt-sect" aria-labelledby="attribution-heading">
        <div className="mkt-container">
          <div className="mkt-sect-hd">
            <h2 id="attribution-heading">Behind the project</h2>
          </div>

          <div className="mkt-attr mkt-glass">
            <div className="mkt-attr-av" aria-hidden="true">MY</div>
            <div>
              <div className="mkt-attr-name">Mohd Yunus</div>
              <a className="mkt-attr-email" href="mailto:mryunus2849855@gmail.com">
                mryunus2849855@gmail.com
              </a>
              <div className="mkt-attr-role">
                Built for{' '}
                <a
                  href="https://digitalheroesco.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#6366f1', textDecoration: 'none' }}
                >
                  Digital Heroes
                </a>{' '}
                — a team building tools that empower creators and e-commerce businesses.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          FINAL CTA
      ══════════════════════════════════════════════════════════════════ */}
      <div className="mkt-final-cta">
        <h2>Start creating for free</h2>
        <p>No account, no credit card, no friction. Open the tool and start immediately.</p>
        <Link to="/" className="mkt-btn-primary" style={{ display:'inline-flex', fontSize:'16px', padding:'15px 36px' }}>
          Open SnapAsset →
        </Link>
        <p className="note">Runs entirely in your browser · No data leaves your device</p>
      </div>

    </MarketingLayout>
  )
}
