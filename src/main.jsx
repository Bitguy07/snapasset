import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

import './App.css'

// ── Route-level code splitting ────────────────────────────────────────────
// Vite creates a separate JS chunk per lazy import.
// The main tool, How It Works, About, and Comparison each download
// only when the user actually navigates to that route.
const ToolApp    = lazy(() => import('./App'))
const HowItWorks = lazy(() => import('./pages/HowItWorks'))
const About      = lazy(() => import('./pages/About'))
const Comparison = lazy(() => import('./pages/Comparison'))

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
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
)
