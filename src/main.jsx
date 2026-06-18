import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { Analytics } from '@vercel/analytics/react'

import './App.css'

// ── Route-level code splitting ────────────────────────────────────────────
// Vite creates a separate JS chunk per lazy import.
// The main tool, How It Works, About, and Comparison each download
// only when the user actually navigates to that route.
const ToolApp    = lazy(() => import('./App'))
const HowItWorks = lazy(() => import('./pages/HowItWorks'))
const About      = lazy(() => import('./pages/About'))
const Comparison = lazy(() => import('./pages/Comparison'))

function MobileBlocked() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "24px",
        textAlign: "center",
        background: "#09090f",
        color: "#fff",
        fontFamily: "system-ui",
      }}
    >
      <h1>This website is optimized for desktop devices.</h1>

      <p style={{ maxWidth: "500px", lineHeight: 1.6 }}>
        Please access this website from a desktop or laptop computer.
        If you are using a mobile browser, you may also try enabling
        <strong> "Desktop Site"</strong> mode for the best experience.
      </p>
    </div>
  );
}

const isMobile = window.innerWidth < 768;

function PageLoader() {
  return (
    <div style={{
      position:'fixed',inset:0,display:'flex',alignItems:'center',
      justifyContent:'center',background:'#09090f',flexDirection:'column',gap:'16px',
    }}>
      <div style={{
        width:'30px',height:'30px',border:'3px solid #1e1e2e',
        borderTopColor:'#6366f1',borderRadius:'50%',
        animation:'_spin .65s linear infinite',
      }}/>
      <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{fontSize:'12px',color:'#3f3f52',fontFamily:'system-ui',letterSpacing:'.04em'}}>
        Loading…
      </span>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
    isMobile ? (
    <MobileBlocked />
  ) : (
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"             element={<ToolApp />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/about"        element={<About />} />
            <Route path="/comparison"   element={<Comparison />} />
          </Routes>
        </Suspense>
         <Analytics />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
)
);
