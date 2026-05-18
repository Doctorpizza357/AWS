import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useMarketIntelligence } from '../context/MarketIntelligenceContext';
import MarketPulseHeatmap from '../components/market/MarketPulseHeatmap';
import PredictiveSalaryArc from '../components/market/PredictiveSalaryArc';
import ViabilityIndexRadar from '../components/market/ViabilityIndexRadar';
import StreamMatrix from '../components/market/StreamMatrix';
import AIAssistantPanel from '../components/market/AIAssistantPanel';
import careers from '../data/careers';
import './MarketIntelligence.css';

function MarketIntelligence() {
  const navigate = useNavigate();
  const { user } = useUser();
  const {
    selectedCareerId,
    selectCareer,
    loadingStates,
    heatmapData,
    salaryData,
    viabilityData,
    streamData,
    lastFetchTimestamps,
  } = useMarketIntelligence();

  const [activePanel, setActivePanel] = useState('overview');
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    if (!user.isOnboarded) {
      navigate('/onboarding');
    }
  }, [user.isOnboarded, navigate]);

  if (!user.isOnboarded) return null;

  const selectedCareer = careers.find(c => c.id === selectedCareerId) || careers[0];
  const isLoading = Object.values(loadingStates).some(s => s === 'loading');

  const getStatusIndicator = () => {
    if (isLoading) return { text: 'Fetching live data...', color: 'var(--accent)' };
    const hasErrors = Object.values(loadingStates).some(s => s === 'error');
    if (hasErrors) return { text: 'Partial data available', color: 'var(--danger)' };
    return { text: 'All systems nominal', color: '#00ffc8' };
  };

  const status = getStatusIndicator();

  return (
    <div className="market-intelligence">
      {/* Header */}
      <header className="mi-header">
        <div className="mi-header-left">
          <div className="mi-title-group">
            <h1 className="mi-title">
              <span className="mi-title-accent">STEM</span> Reality Check
            </h1>
            <p className="mi-subtitle">Market Intelligence Platform</p>
          </div>
          <div className="mi-status">
            <span className="mi-status-dot" style={{ background: status.color }}></span>
            <span className="mi-status-text">{status.text}</span>
          </div>
        </div>

        <div className="mi-header-right">
          <div className="mi-career-selector">
            <label className="mi-selector-label">Analyzing</label>
            <select
              className="mi-selector"
              value={selectedCareerId || ''}
              onChange={(e) => selectCareer(e.target.value)}
            >
              {careers.map(career => (
                <option key={career.id} value={career.id}>
                  {career.icon} {career.title}
                </option>
              ))}
            </select>
          </div>
          {lastFetchTimestamps.heatmap && (
            <span className="mi-last-updated">
              Updated {new Date(lastFetchTimestamps.heatmap).toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      {/* Panel Navigation */}
      <nav className="mi-panel-nav">
        {[
          { id: 'overview', label: 'Overview', icon: '◉' },
          { id: 'heatmap', label: 'Market Pulse', icon: '🗺️' },
          { id: 'salary', label: 'Salary Arc', icon: '📈' },
          { id: 'viability', label: 'Viability Index', icon: '🎯' },
          { id: 'stream', label: 'Job Stream', icon: '⚡' },
        ].map(tab => (
          <button
            key={tab.id}
            className={`mi-panel-tab ${activePanel === tab.id ? 'active' : ''}`}
            onClick={() => setActivePanel(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <div className="mi-content">
        {activePanel === 'overview' && (
          <div className="mi-overview-grid">
            <div className="mi-panel mi-panel-heatmap" onClick={() => setActivePanel('heatmap')}>
              <div className="mi-panel-header">
                <h3>Market Pulse Heatmap</h3>
                <span className="mi-panel-badge">Geographic</span>
              </div>
              <MarketPulseHeatmap
                data={heatmapData}
                loading={loadingStates.heatmap === 'loading'}
                compact
              />
            </div>

            <div className="mi-panel mi-panel-salary" onClick={() => setActivePanel('salary')}>
              <div className="mi-panel-header">
                <h3>Predictive Salary Arc</h3>
                <span className="mi-panel-badge">2015–2035</span>
              </div>
              <PredictiveSalaryArc
                data={salaryData}
                loading={loadingStates.salary === 'loading'}
                compact
              />
            </div>

            <div className="mi-panel mi-panel-viability" onClick={() => setActivePanel('viability')}>
              <div className="mi-panel-header">
                <h3>Viability Index</h3>
                <span className="mi-panel-badge">5-Dimension</span>
              </div>
              <ViabilityIndexRadar
                data={viabilityData}
                careerTitle={selectedCareer.title}
                loading={loadingStates.viability === 'loading'}
                compact
              />
            </div>

            <div className="mi-panel mi-panel-stream" onClick={() => setActivePanel('stream')}>
              <div className="mi-panel-header">
                <h3>Live Job Stream</h3>
                <span className="mi-panel-badge live">● Live</span>
              </div>
              <StreamMatrix
                data={streamData}
                loading={loadingStates.stream === 'loading'}
                compact
              />
            </div>
          </div>
        )}

        {activePanel === 'heatmap' && (
          <div className="mi-panel mi-panel-full">
            <div className="mi-panel-header">
              <h3>Market Pulse Heatmap — {selectedCareer.title}</h3>
              <span className="mi-panel-badge">BLS Location Quotients</span>
            </div>
            <MarketPulseHeatmap
              data={heatmapData}
              loading={loadingStates.heatmap === 'loading'}
            />
          </div>
        )}

        {activePanel === 'salary' && (
          <div className="mi-panel mi-panel-full">
            <div className="mi-panel-header">
              <h3>Predictive Salary Arc — {selectedCareer.title}</h3>
              <span className="mi-panel-badge">Historical + Forecast</span>
            </div>
            <PredictiveSalaryArc
              data={salaryData}
              loading={loadingStates.salary === 'loading'}
            />
          </div>
        )}

        {activePanel === 'viability' && (
          <div className="mi-panel mi-panel-full">
            <div className="mi-panel-header">
              <h3>Viability Index Radar — {selectedCareer.title}</h3>
              <span className="mi-panel-badge">Multi-Dimensional Analysis</span>
            </div>
            <ViabilityIndexRadar
              data={viabilityData}
              careerTitle={selectedCareer.title}
              loading={loadingStates.viability === 'loading'}
            />
          </div>
        )}

        {activePanel === 'stream' && (
          <div className="mi-panel mi-panel-full">
            <div className="mi-panel-header">
              <h3>Real-Time Job Stream — {selectedCareer.title}</h3>
              <span className="mi-panel-badge live">● Live Feed</span>
            </div>
            <StreamMatrix
              data={streamData}
              loading={loadingStates.stream === 'loading'}
            />
          </div>
        )}
      </div>

      {/* AI Assistant */}
      <AIAssistantPanel
        isOpen={aiOpen}
        onToggle={() => setAiOpen(!aiOpen)}
        careerContext={{
          careerId: selectedCareerId,
          careerTitle: selectedCareer?.title,
          currentPanel: activePanel,
        }}
      />
    </div>
  );
}

export default MarketIntelligence;
