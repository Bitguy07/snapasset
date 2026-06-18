import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import MarketingLayout from '../components/MarketingLayout'
import { Helmet } from 'react-helmet-async'


const ROWS = [
  {
    feat: 'Complex object performance',
    snap: 'Excellent — headsets, rings, tyres, fine detail', rb: 'Good', pr: 'Good', ps: 'Excellent', cl: 'Good',
    snapY: true,
  },
  {
    feat: 'Multiple processing variants',
    snap: '10 real-time cards', rb: '1', pr: 'Few', ps: 'Manual', cl: '1',
    snapY: true,
  },
  {
    feat: 'Real-time hover preview',
    snap: 'Yes — persistent', rb: 'No', pr: 'Limited', ps: 'No', cl: 'Limited',
    snapY: true,
  },
  {
    feat: 'Remove Color (seed flood)',
    snap: 'Precise with magnifier', rb: 'Basic', pr: 'Basic', ps: 'Yes', cl: 'No',
    snapY: true,
  },
  {
    feat: 'Live canvas sliders',
    snap: 'Full — brightness, contrast, sharpen, HD…', rb: 'Limited', pr: 'Good', ps: 'Excellent', cl: 'Good',
    snapY: false,
  },
  {
    feat: 'Advanced drop shadows',
    snap: 'Offset, blur, colour, opacity', rb: 'Basic', pr: 'Good', ps: 'Excellent', cl: 'Good',
    snapY: false,
  },
  {
    feat: 'HD Quality + Sharpen',
    snap: 'Built-in sliders', rb: 'No', pr: 'Yes', ps: 'Yes', cl: 'Yes',
    snapY: true,
  },
  {
    feat: 'Persistent zoom & pan',
    snap: 'Yes', rb: 'No', pr: 'No', ps: 'Yes', cl: 'No',
    snapY: true,
  },
  {
    feat: 'Global undo / redo',
    snap: 'Yes — 40 steps', rb: 'No', pr: 'Limited', ps: 'Yes', cl: 'Limited',
    snapY: true,
  },
  {
    feat: 'Pricing model',
    snap: 'Flexible / self-hosted options', rb: 'Subscription', pr: 'Subscription', ps: 'Expensive', cl: 'Subscription',
    snapY: false,
  },
  {
    feat: 'Best for product assets',
    snap: 'Yes ✓', rb: 'General', pr: 'General', ps: 'General', cl: 'General',
    snapY: true,
  },
]

function Cell({ val }) {
  if (val === 'No')  return <span className="mkt-no">✗</span>
  if (val === 'Yes' || val === 'Yes ✓') return <span className="mkt-yes">{val}</span>
  if (val.includes('Limited')) return <span className="mkt-part">{val}</span>
  return <span>{val}</span>
}

export default function Comparison() {

  return (
    <MarketingLayout>
      <Helmet>
        <title>
          SnapAsset vs remove.bg vs PhotoRoom — Background Remover Comparison
        </title>

        <meta
          name="description"
          content="Compare SnapAsset against remove.bg, PhotoRoom, Photoshop, and Claid.ai. Explore features like 10 variants, the Remove Color tool, persistent zoom, and advanced shadows."
        />

        <meta
          property="og:title"
          content="SnapAsset vs remove.bg vs PhotoRoom — Background Remover Comparison"
        />

        <meta
          property="og:description"
          content="See how SnapAsset compares with remove.bg, PhotoRoom, Photoshop, and Claid.ai for product image editing and background removal."
        />

        <meta
          property="og:url"
          content="https://snapasset.vercel.app/comparison"
        />

        <meta property="og:type" content="website" />

        <link
          rel="canonical"
          href="https://snapasset.vercel.app/comparison"
        />
      </Helmet>

      {/* ══════════════════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════════════════ */}
      <div className="mkt-hero-wrap">
        <div className="mkt-orb mkt-orb-1" aria-hidden="true" />
        <div className="mkt-orb mkt-orb-2" aria-hidden="true" />

        <div className="mkt-container mkt-hero-inner">
          <div className="mkt-badge">🏆 The Better Choice</div>

          <h1>
            Why professionals choose{' '}
            <span className="mkt-grad-text">SnapAsset</span>
          </h1>

          <p className="lead">
            Most background removers give you one result and call it done.
            SnapAsset gives you 10 — then lets you refine exactly where needed.
            Here's how it stacks up.
          </p>

          <div className="mkt-btn-row">
            <Link to="/" className="mkt-btn-primary">Try It Free →</Link>
            <a href="#table" className="mkt-btn-ghost">See Full Comparison ↓</a>
          </div>
        </div>
      </div>

      <hr className="mkt-hr" />

      {/* ══════════════════════════════════════════════════════════════════
          QUICK WINS
      ══════════════════════════════════════════════════════════════════ */}
      <section className="mkt-sect" aria-labelledby="wins-heading">
        <div className="mkt-container">
          <div className="mkt-sect-hd">
            <h2 id="wins-heading">
              Three reasons it wins{' '}
              <span className="mkt-grad-text">for product photography</span>
            </h2>
          </div>

          <div className="mkt-wins-grid">
            <div className="mkt-win mkt-glass">
              <span className="mkt-win-icon" aria-hidden="true">🔟</span>
              <h3>10× More Options</h3>
              <p>
                Every other tool gives you one result. SnapAsset generates 10
                simultaneous variants — hover any card to see it live. You always
                start from the best possible base.
              </p>
            </div>
            <div className="mkt-win mkt-glass">
              <span className="mkt-win-icon" aria-hidden="true">⚡</span>
              <h3>Instant Precision</h3>
              <p>
                The Remove Color seed-flood tool cleans up problem areas with a
                single click — and updates all 10 variants at the same time. No
                manual masking, no re-running.
              </p>
            </div>
            <div className="mkt-win mkt-glass">
              <span className="mkt-win-icon" aria-hidden="true">🔁</span>
              <h3>Zero Workflow Breaks</h3>
              <p>
                Persistent zoom/pan, 40-step undo/redo, and real-time sliders mean
                you never lose your place or restart from scratch. Focus stays on
                the work, not the tool.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="mkt-hr" />

      {/* ══════════════════════════════════════════════════════════════════
          COMPARISON TABLE
      ══════════════════════════════════════════════════════════════════ */}
      <section id="table" className="mkt-sect" aria-labelledby="table-heading">
        <div className="mkt-container">
          <div className="mkt-sect-hd">
            <h2 id="table-heading">Feature-by-feature breakdown</h2>
            <p>Compared against the most popular background removal tools.</p>
          </div>

          <div className="mkt-table-wrap" role="region" aria-label="Feature comparison table" tabIndex={0}>
            <table className="mkt-tbl">
              <caption style={{ position:'absolute', width:1, height:1, overflow:'hidden', clip:'rect(0 0 0 0)' }}>
                Comparison of SnapAsset vs remove.bg, PhotoRoom, Photoshop and Claid.ai
              </caption>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col" className="snap">SnapAsset</th>
                  <th scope="col">remove.bg</th>
                  <th scope="col">PhotoRoom</th>
                  <th scope="col">Photoshop</th>
                  <th scope="col">Claid.ai</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr key={i}>
                    <td className="feat">{row.feat}</td>
                    <td className="snap">{row.snap}</td>
                    <td><Cell val={row.rb} /></td>
                    <td><Cell val={row.pr} /></td>
                    <td><Cell val={row.ps} /></td>
                    <td><Cell val={row.cl} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Why it stands out ─────────────────────────────────── */}
          <div className="mkt-sect-hd" style={{ marginTop: '24px' }}>
            <h2>Why SnapAsset stands out</h2>
          </div>

          <div className="mkt-diff-grid" style={{ marginBottom: '56px' }}>
            {[
              {
                icon: '⚖️',
                title: 'Best balance of speed & precision',
                desc: 'Start with one of 10 variants — already the best available — then refine only what needs cleaning. No starting over.',
              },
              {
                icon: '🚫',
                title: 'No workflow interruptions',
                desc: 'Fixed panels, persistent view state, and real-time rendering mean your focus stays on the result, not the UI.',
              },
              {
                icon: '📸',
                title: 'Built for real product photography',
                desc: 'Handles overlapping parts, reflective surfaces, and fine details that break other tools without frustration.',
              },
              {
                icon: '📦',
                title: 'Export-ready assets',
                desc: 'Professional PNG/JPG with shadows, clean edges, and enhancements — straight from the browser, no post-processing.',
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="mkt-diff-card mkt-glass">
                <span className="mkt-diff-icon" aria-hidden="true">{icon}</span>
                <h4>{title}</h4>
                <p>{desc}</p>
              </div>
            ))}
          </div>

          {/* ── Testimonial ───────────────────────────────────────── */}
          <blockquote className="mkt-quote">
            "Finally, a tool that handles my most difficult product shots quickly and gives me full
            control when I need it."
            <cite>— E-commerce Product Photographer</cite>
          </blockquote>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          FINAL CTA
      ══════════════════════════════════════════════════════════════════ */}
      <div className="mkt-final-cta">
        <h2>Ready for better product assets?</h2>
        <p>Experience the difference — no account, no credit card, no installs.</p>
        <Link to="/" className="mkt-btn-primary" style={{ display:'inline-flex', fontSize:'16px', padding:'15px 36px' }}>
          Experience the Difference →
        </Link>
        <p className="note">Free · No sign-up · Runs in your browser</p>
      </div>

    </MarketingLayout>
  )
}
