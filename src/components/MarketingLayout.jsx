import { Link, useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'

const NAV_LINKS = [
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/about',        label: 'About' },
  { to: '/comparison',   label: 'Compare' },
]

export default function MarketingLayout({ children }) {
  const { pathname } = useLocation()
  const rootRef = useRef(null)

  // Override body overflow so marketing pages scroll normally.
  // Restores the tool's overflow:hidden when navigating back.
  useEffect(() => {
    const prev = {
      overflow: document.body.style.overflow,
      height:   document.body.style.height,
    }
    document.body.style.overflow = 'auto'
    document.body.style.height   = 'auto'
    return () => {
      document.body.style.overflow = prev.overflow
      document.body.style.height   = prev.height
    }
  }, [])

  // If already on this page, scroll the fixed container to top instead of
  // doing a no-op navigation.
  const handleNavClick = (to) => {
    if (pathname === to) {
      rootRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <div className="mkt-root" ref={rootRef}>

      {/* ── Sticky nav ─────────────────────────────────────────────────── */}
      <nav className="mkt-nav" aria-label="Main navigation">
        <Link to="/" className="mkt-logo" aria-label="SnapAsset home">
          SnapAsset
        </Link>

        {NAV_LINKS.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`mkt-nav-link${pathname === to ? ' active' : ''}`}
            onClick={() => handleNavClick(to)}
          >
            {label}
          </Link>
        ))}

        <Link to="/" className="mkt-cta-btn">Try Free →</Link>
      </nav>

      {/* ── Page content ───────────────────────────────────────────────── */}
      <main className="mkt-page">
        {children}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="mkt-footer" aria-label="Site footer">
        <span>
          Made by <strong style={{ color: '#71717a' }}>Mohd Yunus</strong>
          &nbsp;·&nbsp;
          <a href="mailto:mryunus2849855@gmail.com">
            mryunus2849855@gmail.com
          </a>
        </span>

        <span style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              style={{ color: '#52525b', textDecoration: 'none', fontSize: '12px' }}
              onClick={() => handleNavClick(to)}
            >
              {label}
            </Link>
          ))}
        </span>

        <a
          href="https://digitalheroesco.com"
          target="_blank"
          rel="noopener noreferrer"
          className="dh-btn"
        >
          Built for Digital Heroes
        </a>
      </footer>
    </div>
  )
}
