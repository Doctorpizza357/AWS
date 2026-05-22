import React from 'react';
import './OpportunityScore.css';

function OpportunityScore({ data = null, compact = false, loading = false }) {
  // data: { score: number (0-100), breakdown: [{label, value (0-1)}], trend: [numbers normalized 0-100] }
  if (!loading && (!data || typeof data.score !== 'number')) {
    return (
      <div className={`opportunity-score ${compact ? 'compact' : ''}`}>
        <div className="os-left">
          <div className="os-score">
            <div className="os-score-value">—</div>
            <div className="os-score-label">Opportunity Score</div>
          </div>
          <div className="os-trend">
            <div className="os-trend-text">No market data available</div>
          </div>
        </div>
        <div className="os-right">
          <div style={{ color: 'var(--text-muted)' }}>Data unavailable — please try again when market data loads.</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`opportunity-score ${compact ? 'compact' : ''}`}>
        <div className="os-left">
          <div className="os-score">
            <div className="mi-skeleton" style={{ width: 64, height: 28, borderRadius: 6 }} />
            <div style={{ height: 8 }} />
            <div className="mi-skeleton" style={{ width: 120, height: 14, borderRadius: 6 }} />
          </div>
          <div className="os-trend">
            <div className="mi-skeleton" style={{ width: 160, height: 40, borderRadius: 6 }} />
            <div style={{ height: 6 }} />
            <div className="mi-skeleton" style={{ width: 110, height: 12, borderRadius: 6 }} />
          </div>
        </div>
        <div className="os-right">
          <ul className="os-breakdown">
            {[0,1,2,3].map(i => (
              <li key={i} className="os-break-item">
                <div className="mi-skeleton" style={{ width: 80, height: 12, borderRadius: 6 }} />
                <div style={{ flex: 1 }} />
                <div className="mi-skeleton" style={{ width: 36, height: 12, borderRadius: 6 }} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const score = Math.round(data.score);
  const breakdown = Array.isArray(data.breakdown) ? data.breakdown : [];
  const trend = Array.isArray(data.trend) ? data.trend : [];

  return (
    <div className={`opportunity-score ${compact ? 'compact' : ''}`}>
      <div className="os-left">
        <div className="os-score">
          <div className="os-score-value">{score}</div>
          <div className="os-score-label">Opportunity Score</div>
        </div>
        <div className="os-trend">
          <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="os-trend-chart" aria-hidden>
            <polyline
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2"
              points={trend.map((v,i)=>`${(i/(trend.length-1))*120},${40 - (v/100)*40}`).join(' ')}
            />
          </svg>
          <div className="os-trend-text">Trend (last {trend.length} months)</div>
        </div>
      </div>

      <div className="os-right">
        <ul className="os-breakdown">
          {breakdown.map(b => (
            <li key={b.label} className="os-break-item">
              <div className="os-break-label">{b.label}</div>
              <div className="os-break-bar">
                <div className="os-break-fill" style={{ width: `${Math.round((b.value||0)*100)}%` }} />
              </div>
              <div className="os-break-value">{Math.round((b.value||0)*100)}%</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default OpportunityScore;
