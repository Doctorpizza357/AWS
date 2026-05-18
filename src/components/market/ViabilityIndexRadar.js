import React from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Tooltip
} from 'recharts';
import './ViabilityIndexRadar.css';

function ViabilityIndexRadar({ data, careerTitle, loading, compact }) {
  if (loading) {
    return (
      <div className={`viability-container ${compact ? 'compact' : ''}`}>
        <div className="viability-skeleton mi-skeleton" style={{ height: compact ? 180 : 400 }}></div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`viability-container ${compact ? 'compact' : ''}`}>
        <div className="viability-empty">No viability data available</div>
      </div>
    );
  }

  // Transform data for Recharts radar
  const chartData = data.map(d => ({
    dimension: d.label.replace('AI Displacement Risk', 'AI Resilience')
      .replace('Capital Inflow Rate', 'Capital Inflow')
      .replace('Supply vs Demand', 'Supply/Demand')
      .replace('Wage Growth vs Inflation', 'Wage Growth')
      .replace('COLA Adjusted Value', 'COLA Value'),
    value: d.id === 'ai-displacement' ? (100 - d.value) : d.value, // Invert AI risk to show resilience
    fullLabel: d.label,
    rawValue: d.rawValue,
    unit: d.unit,
    trend: d.trend,
  }));

  const overallScore = Math.round(chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length);

  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'up': return '↑';
      case 'down': return '↓';
      default: return '→';
    }
  };

  const getTrendColor = (trend, id) => {
    if (id === 'ai-displacement') {
      // For AI displacement, "up" trend is bad
      return trend === 'up' ? '#ef4444' : trend === 'down' ? '#00ffc8' : '#f59e0b';
    }
    return trend === 'up' ? '#00ffc8' : trend === 'down' ? '#ef4444' : '#f59e0b';
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    return (
      <div className="viability-tooltip">
        <div className="viability-tooltip-header">{point.fullLabel}</div>
        <div className="viability-tooltip-score">{point.value}/100</div>
        <div className="viability-tooltip-raw">
          Raw: {point.rawValue} {point.unit}
        </div>
      </div>
    );
  };

  return (
    <div className={`viability-container ${compact ? 'compact' : ''}`}>
      <div className="viability-chart-wrapper">
        <div className="viability-chart" style={{ height: compact ? 180 : 350 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={chartData} cx="50%" cy="50%" outerRadius={compact ? "65%" : "75%"}>
              <PolarGrid stroke="#1e293b" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fill: '#94a3b8', fontSize: compact ? 9 : 11 }}
              />
              {!compact && (
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: '#475569', fontSize: 9 }}
                  axisLine={false}
                />
              )}
              <Radar
                name={careerTitle}
                dataKey="value"
                stroke="#00ffc8"
                fill="#00ffc8"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={{ fill: '#00ffc8', r: compact ? 3 : 4 }}
              />
              {!compact && <Tooltip content={<CustomTooltip />} />}
            </RadarChart>
          </ResponsiveContainer>

          {/* Center score */}
          <div className="viability-center-score">
            <span className="center-score-value">{overallScore}</span>
            <span className="center-score-label">Overall</span>
          </div>
        </div>
      </div>

      {/* Dimension breakdown */}
      {!compact && (
        <div className="viability-dimensions">
          {data.map(dim => (
            <div key={dim.id} className="dimension-row">
              <div className="dimension-info">
                <span className="dimension-name">{dim.label}</span>
                <span
                  className="dimension-trend"
                  style={{ color: getTrendColor(dim.trend, dim.id) }}
                >
                  {getTrendIcon(dim.trend)} {dim.trend}
                </span>
              </div>
              <div className="dimension-bar-wrapper">
                <div className="dimension-bar">
                  <div
                    className="dimension-bar-fill"
                    style={{
                      width: `${dim.id === 'ai-displacement' ? (100 - dim.value) : dim.value}%`,
                      background: dim.value > 70 ? '#00ffc8' : dim.value > 40 ? '#f59e0b' : '#ef4444',
                    }}
                  ></div>
                </div>
                <span className="dimension-score">
                  {dim.id === 'ai-displacement' ? (100 - dim.value) : dim.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ViabilityIndexRadar;
