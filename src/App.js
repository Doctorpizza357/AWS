import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import CareerPath from './pages/CareerPath';
import Simulation from './pages/Simulation';
import Profile from './pages/Profile';
import { UserProvider } from './context/UserContext';
import { MarketIntelligenceProvider } from './context/MarketIntelligenceContext';
import './App.css';

const MarketIntelligence = lazy(() => import('./pages/MarketIntelligence'));

function App() {
  return (
    <UserProvider>
      <Router>
        <div className="app">
          <Navbar />
          <main className="main-content">
            <Suspense fallback={<div className="page-loader">Loading...</div>}>
              <Routes>
                <Route path="/" element={<Landing />} />
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
        </div>
      </Router>
    </UserProvider>
  );
}

export default App;
