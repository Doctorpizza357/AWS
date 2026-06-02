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
import SkillBridge from './pages/SkillBridge';
import InterviewHistory from './pages/InterviewHistory';
import AIAssistantPopup from './components/AIAssistantPopup';
import ProtectedRoute from './components/ProtectedRoute';
import { UserProvider } from './context/UserContext';
import { MarketIntelligenceProvider } from './context/MarketIntelligenceContext';
import { InterviewProvider } from './context/InterviewContext';
import { SkillBridgeProvider } from './context/SkillBridgeContext';
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
const InterviewHub = lazyWithRetry(() => import('./pages/InterviewHub'), 'interview-hub');
const MockInterview = lazyWithRetry(() => import('./pages/MockInterview'), 'mock-interview');
// InterviewHistory imported directly (not lazy) to avoid lazy resolution issues
const ResumeTailor = lazyWithRetry(() => import('./pages/ResumeTailor'), 'resume-tailor');
const TechnicalAssessment = lazyWithRetry(() => import('./pages/TechnicalAssessment'), 'technical-assessment');

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
      <InterviewProvider>
        <SkillBridgeProvider>
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
                  <Route path="/skillbridge" element={<ProtectedRoute><SkillBridge /></ProtectedRoute>} />
                  <Route path="/market-intelligence" element={
                    <MarketIntelligenceProvider>
                      <MarketIntelligence />
                    </MarketIntelligenceProvider>
                  } />
                  <Route path="/interview" element={<InterviewHub />} />
                  <Route path="/interview/mock" element={<MockInterview />} />
                  <Route path="/interview/history" element={<InterviewHistory />} />
                  <Route path="/interview/resume" element={<ResumeTailor />} />
                  <Route path="/interview/technical" element={<TechnicalAssessment />} />
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
                  <Link to="/interview" className="site-footer__link">Interview AI</Link>
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
        </SkillBridgeProvider>
      </InterviewProvider>
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
