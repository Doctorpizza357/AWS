import React, { useState, useMemo } from 'react';
import { useMarketIntelligence } from '../../context/MarketIntelligenceContext';
import './MarketPulseHeatmap.css';

// Simplified US state paths for SVG rendering
const US_STATES_PATHS = {
  AL: { x: 580, y: 380, w: 40, h: 50 },
  AK: { x: 80, y: 440, w: 60, h: 40 },
  AZ: { x: 180, y: 340, w: 50, h: 55 },
  AR: { x: 500, y: 360, w: 45, h: 40 },
  CA: { x: 80, y: 240, w: 45, h: 90 },
  CO: { x: 260, y: 270, w: 55, h: 45 },
  CT: { x: 720, y: 200, w: 20, h: 20 },
  DE: { x: 700, y: 260, w: 15, h: 20 },
  FL: { x: 620, y: 420, w: 55, h: 55 },
  GA: { x: 610, y: 360, w: 45, h: 50 },
  HI: { x: 200, y: 460, w: 40, h: 25 },
  ID: { x: 170, y: 150, w: 45, h: 65 },
  IL: { x: 520, y: 240, w: 35, h: 60 },
  IN: { x: 555, y: 240, w: 30, h: 50 },
  IA: { x: 460, y: 220, w: 50, h: 40 },
  KS: { x: 380, y: 300, w: 60, h: 40 },
  KY: { x: 570, y: 290, w: 55, h: 30 },
  LA: { x: 490, y: 410, w: 45, h: 40 },
  ME: { x: 740, y: 100, w: 30, h: 50 },
  MD: { x: 680, y: 260, w: 30, h: 20 },
  MA: { x: 730, y: 180, w: 25, h: 18 },
  MI: { x: 550, y: 160, w: 45, h: 60 },
  MN: { x: 430, y: 130, w: 50, h: 60 },
  MS: { x: 540, y: 380, w: 35, h: 55 },
  MO: { x: 470, y: 290, w: 50, h: 50 },
  MT: { x: 220, y: 110, w: 70, h: 45 },
  NE: { x: 360, y: 240, w: 65, h: 35 },
  NV: { x: 130, y: 230, w: 45, h: 70 },
  NH: { x: 730, y: 140, w: 18, h: 35 },
  NJ: { x: 710, y: 230, w: 18, h: 30 },
  NM: { x: 230, y: 350, w: 55, h: 55 },
  NY: { x: 670, y: 150, w: 50, h: 55 },
  NC: { x: 630, y: 310, w: 60, h: 30 },
  ND: { x: 360, y: 120, w: 55, h: 40 },
  OH: { x: 590, y: 230, w: 40, h: 45 },
  OK: { x: 390, y: 340, w: 60, h: 40 },
  OR: { x: 100, y: 140, w: 60, h: 50 },
  PA: { x: 650, y: 210, w: 50, h: 35 },
  RI: { x: 735, y: 195, w: 12, h: 15 },
  SC: { x: 640, y: 340, w: 40, h: 35 },
  SD: { x: 360, y: 170, w: 55, h: 40 },
  TN: { x: 545, y: 320, w: 65, h: 25 },
  TX: { x: 340, y: 380, w: 90, h: 90 },
  UT: { x: 190, y: 250, w: 45, h: 55 },
  VT: { x: 720, y: 130, w: 18, h: 35 },
  VA: { x: 640, y: 275, w: 55, h: 35 },
  WA: { x: 110, y: 80, w: 55, h: 45 },
  WV: { x: 620, y: 260, w: 35, h: 40 },
  WI: { x: 480, y: 150, w: 45, h: 55 },
  WY: { x: 250, y: 190, w: 55, h: 45 },
};

function MarketPulseHeatmap({ data, loading, compact }) {
  const { selectedState, selectState } = useMarketIntelligence();
  const [hoveredState, setHoveredState] = useState(null);

  const maxLQ = useMemo(() => {
    if (!data || data.length === 0) return 3;
    return Math.max(...data.map(d => d.locationQuotient));
  }, [data]);

  const getColor = (lq) => {
    if (!lq) return '#1a2235';
    const intensity = Math.min(lq / maxLQ, 1);
    if (intensity > 0.7) return `rgba(0, 255, 200, ${0.3 + intensity * 0.6})`;
    if (intensity > 0.4) return `rgba(0, 180, 216, ${0.2 + intensity * 0.5})`;
    return `rgba(100, 116, 139, ${0.1 + intensity * 0.3})`;
  };

  const getStateData = (stateCode) => {
    return data?.find(d => d.stateCode === stateCode);
  };

  const tooltipData = hoveredState ? getStateData(hoveredState) : null;

  if (loading) {
    return (
      <div className={`heatmap-container ${compact ? 'compact' : ''}`}>
        <div className="heatmap-skeleton mi-skeleton" style={{ height: compact ? 180 : 400 }}></div>
      </div>
    );
  }

  return (
    <div className={`heatmap-container ${compact ? 'compact' : ''}`}>
      <div className="heatmap-map">
        <svg viewBox="0 0 800 520" className="us-map-svg">
          {Object.entries(US_STATES_PATHS).map(([code, pos]) => {
            const stateData = getStateData(code);
            const isSelected = selectedState === code;
            const isHovered = hoveredState === code;

            return (
              <g key={code}>
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={pos.w}
                  height={pos.h}
                  rx={4}
                  fill={getColor(stateData?.locationQuotient)}
                  stroke={isSelected ? '#00ffc8' : isHovered ? '#00b4d8' : '#1e293b'}
                  strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 0.5}
                  className="state-rect"
                  onMouseEnter={() => setHoveredState(code)}
                  onMouseLeave={() => setHoveredState(null)}
                  onClick={() => selectState(code)}
                />
                {!compact && (
                  <text
                    x={pos.x + pos.w / 2}
                    y={pos.y + pos.h / 2 + 4}
                    textAnchor="middle"
                    className="state-label"
                    fontSize={pos.w < 25 ? 7 : 9}
                    fill={stateData?.locationQuotient > maxLQ * 0.5 ? '#0a0f1a' : '#94a3b8'}
                    pointerEvents="none"
                  >
                    {code}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltipData && !compact && (
          <div className="heatmap-tooltip">
            <div className="tooltip-header">{tooltipData.stateName}</div>
            <div className="tooltip-row">
              <span>Location Quotient</span>
              <span className="tooltip-value">{tooltipData.locationQuotient.toFixed(2)}</span>
            </div>
            <div className="tooltip-row">
              <span>Employment</span>
              <span className="tooltip-value">{tooltipData.employment.toLocaleString()}</span>
            </div>
            <div className="tooltip-row">
              <span>Mean Wage</span>
              <span className="tooltip-value">${tooltipData.meanWage.toLocaleString()}</span>
            </div>
            <div className="tooltip-row">
              <span>YoY Change</span>
              <span className={`tooltip-value ${tooltipData.percentChange >= 0 ? 'positive' : 'negative'}`}>
                {tooltipData.percentChange >= 0 ? '+' : ''}{tooltipData.percentChange}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      {!compact && (
        <div className="heatmap-legend">
          <span className="legend-label">Low Concentration</span>
          <div className="legend-gradient"></div>
          <span className="legend-label">High Concentration</span>
        </div>
      )}

      {/* Selected State Detail */}
      {!compact && selectedState && getStateData(selectedState) && (
        <div className="heatmap-detail">
          <h4>{getStateData(selectedState).stateName}</h4>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-value">{getStateData(selectedState).locationQuotient.toFixed(2)}</span>
              <span className="detail-label">Location Quotient</span>
            </div>
            <div className="detail-item">
              <span className="detail-value">{getStateData(selectedState).employment.toLocaleString()}</span>
              <span className="detail-label">Total Employment</span>
            </div>
            <div className="detail-item">
              <span className="detail-value">${getStateData(selectedState).meanWage.toLocaleString()}</span>
              <span className="detail-label">Mean Annual Wage</span>
            </div>
            <div className="detail-item">
              <span className={`detail-value ${getStateData(selectedState).percentChange >= 0 ? 'positive' : 'negative'}`}>
                {getStateData(selectedState).percentChange >= 0 ? '+' : ''}{getStateData(selectedState).percentChange}%
              </span>
              <span className="detail-label">Year-over-Year</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MarketPulseHeatmap;
