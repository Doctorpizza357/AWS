import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useMarketIntelligence } from '../context/MarketIntelligenceContext';
import MarketPulseHeatmap from '../components/market/MarketPulseHeatmap';
import PredictiveSalaryArc from '../components/market/PredictiveSalaryArc';
import ViabilityIndexRadar from '../components/market/ViabilityIndexRadar';
import OpportunityScore from '../components/market/OpportunityScore';
import careers from '../data/careers';
import { getIconComponent } from '../utils/iconMap';
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
    // streamData removed
    lastFetchTimestamps,
  } = useMarketIntelligence();

  const [activePanel, setActivePanel] = useState('overview');

  useEffect(() => {
    if (!user.isOnboarded) {
      navigate('/onboarding');
    }
  }, [user.isOnboarded, navigate]);

  if (!user.isOnboarded) return null;

  const selectedCareer = careers.find(c => c.id === selectedCareerId) || careers[0];
  const isLoading = Object.values(loadingStates).some(s => s === 'loading');
  const allSuccess = Object.values(loadingStates).every(s => s === 'success');

  const getStatusIndicator = () => {
    if (isLoading) return { text: 'Fetching live data...', color: 'var(--accent)' };
    const hasErrors = Object.values(loadingStates).some(s => s === 'error');
    if (hasErrors) return { text: 'Partial data available', color: 'var(--danger)' };
    return { text: 'Status: Operational', color: '#00ffc8' };
  };

  const status = getStatusIndicator();
  const tabConfig = [
    { id: 'overview', label: 'Overview', icon: 'market-overview' },
    { id: 'heatmap', label: 'Market Pulse', icon: 'market-heatmap' },
    { id: 'salary', label: 'Salary Arc', icon: 'market-salary' },
    { id: 'viability', label: 'Viability Index', icon: 'market-viability' },
    { id: 'opportunity', label: 'Opportunity Score', icon: 'market-opportunity' },
  ];

  return (
    <div className="market-intelligence">
      {/* Panel Navigation */}
      <nav className="mi-panel-nav">
        {tabConfig.map(tab => {
          const TabIcon = getIconComponent(tab.icon);
          return (
            <button
              key={tab.id}
              className={`mi-panel-tab ${activePanel === tab.id ? 'active' : ''}`}
              onClick={() => setActivePanel(tab.id)}
            >
              <span className="tab-icon"><TabIcon size={16} aria-hidden="true" /></span>
              <span className="tab-label">{tab.label}</span>
            </button>
          );
        })}
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

            <div className="mi-panel mi-panel-opportunity" onClick={() => setActivePanel('opportunity')}>
              <div className="mi-panel-header">
                <h3>Opportunity Score</h3>
                <span className="mi-panel-badge">Composite KPI</span>
              </div>
              {(() => {
                // Derive components from available market data
                const avgLQ = Array.isArray(heatmapData) && heatmapData.length > 0
                  ? heatmapData.reduce((s, r) => s + (r.locationQuotient || 0), 0) / heatmapData.length
                  : 0.6;

                // demandScore: scale avgLQ (typical 0.5-2.0) into 10-90
                const demandScore = Math.max(10, Math.min(90, Math.round(((avgLQ / 2) * 100))));

                // growthScore: use viabilityData 'supply-demand' value if present
                const supplyItem = Array.isArray(viabilityData) ? viabilityData.find(i => i.id === 'supply-demand') : null;
                const growthScore = supplyItem ? Math.max(10, Math.min(90, Math.round(supplyItem.value))) : 50;

                // salaryScore: use most recent median from salaryData.historical and normalize to 150k cap
                const hist = salaryData?.historical || [];
                const latestMedian = hist.length ? hist[hist.length - 1].median : null;
                const salaryScore = latestMedian ? Math.max(10, Math.min(90, Math.round((latestMedian / 150000) * 100))) : 50;

                // viabilityScore: average of viability value fields
                const viVals = Array.isArray(viabilityData) && viabilityData.length ? viabilityData.map(v => v.value || 50) : [50];
                const viabilityScore = Math.max(10, Math.min(90, Math.round(viVals.reduce((a,b) => a+b,0)/viVals.length)));

                // Composite weighted scoring
                const score = Math.round(demandScore * 0.35 + growthScore * 0.25 + salaryScore * 0.25 + viabilityScore * 0.15);

                const breakdown = [
                  { label: 'Demand', value: Math.round((demandScore/100)*100)/100 },
                  { label: 'Growth', value: Math.round((growthScore/100)*100)/100 },
                  { label: 'Salary', value: Math.round((salaryScore/100)*100)/100 },
                  { label: 'Viability', value: Math.round((viabilityScore/100)*100)/100 },
                ];

                const trend = hist.slice(-6).map(r => r.median ? Math.round((r.median/150000)*100) : 50);

                return (
                  <OpportunityScore data={{ score, breakdown, trend }} compact loading={isLoading} />
                );
              })()}
            </div>
            {/* Live Job Stream removed */}
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

        {activePanel === 'opportunity' && (
          <div className="mi-panel mi-panel-full">
            <div className="mi-panel-header">
              <h3>Opportunity Score — {selectedCareer.title}</h3>
              <span className="mi-panel-badge">Composite KPI</span>
            </div>
            {allSuccess ? (
              <OpportunityScore
                data={(() => {
                  const avgLQ = Array.isArray(heatmapData) && heatmapData.length > 0
                    ? heatmapData.reduce((s, r) => s + (r.locationQuotient || 0), 0) / heatmapData.length
                    : 0;
                  const demandScore = Math.max(10, Math.min(90, Math.round(((avgLQ / 2) * 100))));
                  const supplyItem = Array.isArray(viabilityData) ? viabilityData.find(i => i.id === 'supply-demand') : null;
                  const growthScore = supplyItem ? Math.max(10, Math.min(90, Math.round(supplyItem.value))) : null;
                  const hist = salaryData?.historical || [];
                  const latestMedian = hist.length ? hist[hist.length - 1].median : null;
                  const salaryScore = latestMedian ? Math.max(10, Math.min(90, Math.round((latestMedian / 150000) * 100))) : null;
                  const viVals = Array.isArray(viabilityData) && viabilityData.length ? viabilityData.map(v => v.value || 50) : [];
                  const viabilityScore = viVals.length ? Math.max(10, Math.min(90, Math.round(viVals.reduce((a,b) => a+b,0)/viVals.length))) : null;
                  const score = Math.round(demandScore * 0.35 + growthScore * 0.25 + salaryScore * 0.25 + viabilityScore * 0.15);
                  const breakdown = [
                    { label: 'Demand', value: demandScore / 100 },
                    { label: 'Growth', value: growthScore / 100 },
                    { label: 'Salary', value: salaryScore / 100 },
                    { label: 'Viability', value: viabilityScore / 100 },
                  ];
                  const trend = hist.slice(-12).map(r => r.median ? Math.round((r.median/150000)*100) : 0);
                  return { score, breakdown, trend };
                })()}
                loading={false}
              />
            ) : (
              <OpportunityScore loading={true} />
            )}
          </div>
        )}

        {/* Stream panel removed */}
      </div>

    </div>
  );
}

export default MarketIntelligence;
