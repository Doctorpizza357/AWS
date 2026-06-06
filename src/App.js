import React, { lazy, Suspense, useCallback, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './i18n';
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
import Leaderboard from './pages/Leaderboard';
import RoleModels from './pages/RoleModels';
import AIAssistantPopup from './components/AIAssistantPopup';
import AvatarCard from './components/AvatarCard';
import ProtectedRoute from './components/ProtectedRoute';
import { UserProvider } from './context/UserContext';
import { MarketIntelligenceProvider } from './context/MarketIntelligenceContext';
import { InterviewProvider } from './context/InterviewContext';
import { SkillBridgeProvider } from './context/SkillBridgeContext';
import { AvatarProvider, useAvatar } from './context/AvatarContext';
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

// Connected AvatarCard that reads from AvatarContext and passes props.
// Also feeds real user metrics for context-aware AI tips and handles navigation.
function ConnectedAvatarCard() {
  const { state, dismiss } = useAvatar();
  const navigate = useNavigate();

  const handleContinue = useCallback(() => {
    // Record positive mood signal — user is engaged
    import('./services/moodService').then(({ recordSignal }) => {
      recordSignal('tell_me_more');
    });

    const event = new CustomEvent('avatar:continue-conversation', {
      detail: {
        message: state.currentMessage,
        checkpointId: state.checkpointId,
        avatarName: state.currentAvatar?.displayName,
      },
    });
    window.dispatchEvent(event);
    dismiss();
  }, [state.currentMessage, state.checkpointId, state.currentAvatar, dismiss]);

  const handleActionClick = useCallback((path) => {
    // Record positive mood signal — user followed actionable advice
    import('./services/moodService').then(({ recordSignal }) => {
      recordSignal('tell_me_more');
    });
    dismiss();
    navigate(path);
  }, [dismiss, navigate]);

  return (
    <AvatarCard
      avatar={state.currentAvatar}
      message={state.currentMessage}
      actionLink={state.actionLink}
      isLoading={state.isLoading}
      onDismiss={dismiss}
      onContinue={handleContinue}
      onActionClick={handleActionClick}
      isVisible={state.isVisible}
    />
  );
}

// Inner component that uses useAuth (must be inside AuthProvider)
function AppContent() {
  const { user } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);
  
  // Show navbar on all pages except login
  const showNavbar = !['/login'].includes(location.pathname);

  return (
    <UserProvider>
      <InterviewProvider>
        <SkillBridgeProvider>
          <AvatarProvider>
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
                  <Route path="/leaderboard" element={<Leaderboard />} />
                  <Route path="/role-models" element={<RoleModels />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </Suspense>
            </main>
            <footer className="site-footer">
              <div className="site-footer__inner">
                <div className="site-footer__brand">
                  <span className="site-footer__name">{t('brand.name')}</span>
                  <p className="site-footer__text">
                    {t('brand.tagline')}
                  </p>
                </div>

                <div className="site-footer__links" aria-label="Footer links">
                  <Link to="/" className="site-footer__link">{t('common.home')}</Link>
                  <Link to="/dashboard" className="site-footer__link">{t('nav.dashboard')}</Link>
                  <Link to="/market-intelligence" className="site-footer__link">{t('nav.marketIntel')}</Link>
                  <Link to="/interview" className="site-footer__link">{t('nav.interviewAI')}</Link>
                  <Link to="/profile" className="site-footer__link">{t('common.profile')}</Link>
                </div>

                <div className="site-footer__meta">
                  <span>{t('footer.copyright')}</span>
                  <span>{t('footer.builtFor')}</span>
                </div>
              </div>
            </footer>
            <AIAssistantPopup />
            <ConnectedAvatarCard />
          </div>
          </AvatarProvider>
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
