import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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

const MarketIntelligence = lazy(() => import('./pages/MarketIntelligence'));

// Inner component that uses useAuth (must be inside AuthProvider)
function AppContent() {
  const { user } = useAuth();
  const location = useLocation();
  
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
