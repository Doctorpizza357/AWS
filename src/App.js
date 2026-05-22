import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import CareerPath from './pages/CareerPath';
import Simulation from './pages/Simulation';
import Profile from './pages/Profile';
import AIAssistantPopup from './components/AIAssistantPopup';
import { UserProvider } from './context/UserContext';
import { MarketIntelligenceProvider } from './context/MarketIntelligenceContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import './App.css';

const lazyWithRetry = (importFn, key) =>
  lazy(async () => {
    const storageKey = `lazy-retry-${key}`;
    const hasRefreshed = sessionStorage.getItem(storageKey) === 'true';

    try {
      const module = await importFn();
      sessionStorage.setItem(storageKey, 'false');
      return module;
    } catch (error) {
      const errorMessage = String(error && error.message ? error.message : error);
      const isChunkLoadError =
        /ChunkLoadError/i.test(errorMessage) ||
        /Loading chunk [\w-]+ failed/i.test(errorMessage) ||
        /Failed to fetch dynamically imported module/i.test(errorMessage);

      // Refresh once when a stale chunk is requested, then surface the error if it persists.
      if (isChunkLoadError && !hasRefreshed) {
        sessionStorage.setItem(storageKey, 'true');
        window.location.reload();
        return new Promise(() => {});
      }

      throw error;
    }
  });

const MarketIntelligence = lazyWithRetry(() => import('./pages/MarketIntelligence'), 'market-intelligence');

// Inner component that uses useAuth (must be inside AuthProvider)
function AppContent() {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);
  
  // Show navbar on all pages except login
  const showNavbar = !['/login'].includes(location.pathname);

  return (
    <UserProvider>
      <div className="app">
        {showNavbar && <Navbar />}
        <main className="main-content">
          <Suspense fallback={<div className="page-loader">Loading...</div>}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/career/:careerId" element={<CareerPath />} />
              <Route path="/simulation/:careerId/:scenarioId" element={<Simulation />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/market-intelligence" element={
                <MarketIntelligenceProvider>
                  <MarketIntelligence />
                </MarketIntelligenceProvider>
              } />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="site-footer">
          <div className="site-footer__inner">
            <div className="site-footer__brand">
              <span className="site-footer__name">STEM PathfindR</span>
              <p className="site-footer__text">
                Personalized STEM career discovery, powered by AI.
              </p>
            </div>

            <div className="site-footer__links" aria-label="Footer links">
              <Link to="/" className="site-footer__link">Home</Link>
              <Link to="/dashboard" className="site-footer__link">Dashboard</Link>
              <Link to="/market-intelligence" className="site-footer__link">Market Intel</Link>
              <Link to="/profile" className="site-footer__link">Profile</Link>
            </div>

            <div className="site-footer__meta">
              <span>© 2026 STEM PathfindR</span>
              <span>Built for students, educators, and career explorers.</span>
            </div>
          </div>
        </footer>
        <AIAssistantPopup />
      </div>
    </UserProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
