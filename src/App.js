import React, { lazy, Suspense, useCallback, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './i18n';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import AIAssistantPopup from './components/AIAssistantPopup';
import AvatarCard from './components/AvatarCard';
import ThemeToggle from './components/ThemeToggle';
import { UserProvider } from './context/UserContext';
import { MarketIntelligenceProvider } from './context/MarketIntelligenceContext';
import { InterviewProvider } from './context/InterviewContext';
import { SkillBridgeProvider } from './context/SkillBridgeContext';
import { AvatarProvider, useAvatar } from './context/AvatarContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { GameProvider } from './context/GameContext';
import { SocialProvider } from './context/SocialContext';
import ProtectedRoute from './components/ProtectedRoute';
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

const Campus = lazyWithRetry(() => import('./pages/Campus'), 'campus');
const MarketIntelligence = lazyWithRetry(() => import('./pages/MarketIntelligence'), 'market-intelligence');
const InterviewHub = lazyWithRetry(() => import('./pages/InterviewHub'), 'interview-hub');
const MockInterview = lazyWithRetry(() => import('./pages/MockInterview'), 'mock-interview');
const ResumeTailor = lazyWithRetry(() => import('./pages/ResumeTailor'), 'resume-tailor');
const TechnicalAssessment = lazyWithRetry(() => import('./pages/TechnicalAssessment'), 'technical-assessment');
const InterviewHistory = lazyWithRetry(() => import('./pages/InterviewHistory'), 'interview-history');
const SkillBridge = lazyWithRetry(() => import('./pages/SkillBridge'), 'skillbridge');
const Leaderboard = lazyWithRetry(() => import('./pages/Leaderboard'), 'leaderboard');
const Profile = lazyWithRetry(() => import('./pages/Profile'), 'profile');
const RoleModels = lazyWithRetry(() => import('./pages/RoleModels'), 'role-models');
const Simulation = lazyWithRetry(() => import('./pages/Simulation'), 'simulation');
const CareerPath = lazyWithRetry(() => import('./pages/CareerPath'), 'career-path');

// Wrapper that adds a floating "Back to Campus" button to feature pages
function WithCampusReturn({ children }) {
  const navigate = useNavigate();
  return (
    <>
      <div style={{
        position: 'fixed', top: 12, left: 12, zIndex: 999,
      }}>
        <button
          onClick={() => navigate('/campus')}
          style={{
            background: 'rgba(30,30,50,0.9)', color: '#4A90D9', border: '1px solid rgba(74,144,217,0.4)',
            padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            backdropFilter: 'blur(4px)', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.target.style.background = '#4A90D9'; e.target.style.color = '#fff'; }}
          onMouseLeave={e => { e.target.style.background = 'rgba(30,30,50,0.9)'; e.target.style.color = '#4A90D9'; }}
        >
          ← Back to Campus
        </button>
      </div>
      {children}
    </>
  );
}

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
  
  // Show navbar on all pages except login and campus (campus has its own HUD)
  const showNavbar = !['/login', '/campus'].includes(location.pathname);
  const showFooter = location.pathname !== '/campus';

  return (
    <UserProvider>
      <SocialProvider>
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
                  <Route path="/dashboard" element={<Navigate to="/campus" replace />} />
                  <Route path="/campus" element={<GameProvider><Campus /></GameProvider>} />
                  {/* Feature pages - accessible from campus, with back button */}
                  <Route path="/career/:careerId" element={<WithCampusReturn><CareerPath /></WithCampusReturn>} />
                  <Route path="/simulation/:careerId/:scenarioId" element={<WithCampusReturn><Simulation /></WithCampusReturn>} />
                  <Route path="/profile" element={<WithCampusReturn><Profile /></WithCampusReturn>} />
                  <Route path="/skillbridge" element={<WithCampusReturn><ProtectedRoute><SkillBridge /></ProtectedRoute></WithCampusReturn>} />
                  <Route path="/market-intelligence" element={
                    <WithCampusReturn>
                      <MarketIntelligenceProvider>
                        <MarketIntelligence />
                      </MarketIntelligenceProvider>
                    </WithCampusReturn>
                  } />
                  <Route path="/interview" element={<WithCampusReturn><InterviewHub /></WithCampusReturn>} />
                  <Route path="/interview/mock" element={<WithCampusReturn><MockInterview /></WithCampusReturn>} />
                  <Route path="/interview/history" element={<WithCampusReturn><InterviewHistory /></WithCampusReturn>} />
                  <Route path="/interview/resume" element={<WithCampusReturn><ResumeTailor /></WithCampusReturn>} />
                  <Route path="/interview/technical" element={<WithCampusReturn><TechnicalAssessment /></WithCampusReturn>} />
                  <Route path="/leaderboard" element={<WithCampusReturn><Leaderboard /></WithCampusReturn>} />
                  <Route path="/role-models" element={<WithCampusReturn><RoleModels /></WithCampusReturn>} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </Suspense>
            </main>
            {showFooter && <footer className="site-footer">
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
            </footer>}
            {showFooter && <AIAssistantPopup />}
            {showFooter && <ThemeToggle />}
            <ConnectedAvatarCard />
          </div>
          </AvatarProvider>
        </SkillBridgeProvider>
      </InterviewProvider>
      </SocialProvider>
    </UserProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
