import React from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import './GapRadarChart.css';

/**
 * GapRadarChart
 *
 * Renders a radar chart overlaying every skill's `currentLevel` and
 * `targetLevel` on a 0–100 axis (Req 7.1). The chart is hidden when the
 * active Skill_Requirements set has fewer than 3 entries — for 1-2 skills
 * `GapBarList` takes over (Req 7.5), and for zero skills the gap panel
 * renders the empty state in `GapBarList` (Req 7.6).
 *
 * The default `recharts` `<Tooltip>` renders synchronously on hover/focus,
 * well under the 200ms budget required by Req 7.3, and shows skill name,
 * current level, target level, and gap.
 *
 * Validates: Requirements 7.1, 7.3, 7.5
 */

/**
 * Render the contents of the tooltip when the user hovers or
 * keyboard-focuses a radar point. `recharts` invokes this with the
 * payloads for both the `current` and `target` series for the same skill.
 */
function GapRadarTooltip({ active, payload }) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;

  const datum = payload[0] && payload[0].payload;
  if (!datum) return null;

  const { skill, current, target, gap } = datum;

  return (
    <div className="gap-radar-tooltip" role="tooltip">
      <div className="gap-radar-tooltip__skill">{skill}</div>
      <dl className="gap-radar-tooltip__rows">
        <div className="gap-radar-tooltip__row">
          <dt>Current</dt>
          <dd>{current}</dd>
        </div>
        <div className="gap-radar-tooltip__row">
          <dt>Target</dt>
          <dd>{target}</dd>
        </div>
        <div className="gap-radar-tooltip__row gap-radar-tooltip__row--gap">
          <dt>Gap</dt>
          <dd>{gap}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Custom angle-axis tick that wraps multi-word skill names onto multiple
 * lines so labels never clip off the chart edge.
 *
 * Recharts hands every tick component a payload with the label string,
 * the projected `(x, y)` coordinate of the tick, and the
 * `textAnchor` it would have chosen for default rendering. We split the
 * label on whitespace and emit one `<tspan>` per word, stacked
 * vertically with `dy`. The first line stays at the original `y` so the
 * shrunk-by-one-line baseline lines up with where recharts would have
 * placed the un-wrapped label; subsequent lines drop by the line height.
 */
const RADAR_TICK_LINE_HEIGHT = 14;

function RadarAngleTick(props) {
  const {
    x,
    y,
    payload,
    textAnchor,
    fill = '#cbd5e1',
    fontSize = 12,
  } = props;
  if (!payload || typeof payload.value !== 'string') return null;

  const words = payload.value.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return null;

  // Center the wrapped block vertically on the original `y` so two-line
  // labels above the chart aren't pushed off the top edge and labels
  // below aren't pushed off the bottom. The block's height is
  // `(words.length - 1) * lineHeight`; shifting up by half of that
  // centers the middle of the block on the original baseline.
  const totalOffset = ((words.length - 1) * RADAR_TICK_LINE_HEIGHT) / 2;

  return (
    <text
      x={x}
      y={y - totalOffset}
      textAnchor={textAnchor}
      fill={fill}
      fontSize={fontSize}
    >
      {words.map((word, i) => (
        <tspan
          key={`${word}-${i}`}
          x={x}
          dy={i === 0 ? 0 : RADAR_TICK_LINE_HEIGHT}
        >
          {word}
        </tspan>
      ))}
    </text>
  );
}

function GapRadarChart() {
  const { requirements, skillGaps } = useSkillBridge();

  // Req 7.5 / 7.6 — the radar is only meaningful for 3+ skills. The
  // bar-list component (`GapBarList`) handles the 1-2 skills and zero
  // skills cases.
  if (!Array.isArray(requirements) || requirements.length < 3) {
    return null;
  }

  // `skillGaps` is sorted by gap desc → weight desc → name asc (Req 6.2).
  // For radar legibility we project the same entries — the visual order
  // around the axis isn't user-facing data, but the tooltip values are.
  const data = (Array.isArray(skillGaps) ? skillGaps : []).map((g) => ({
    skill: g.name,
    current: g.currentLevel,
    target: g.targetLevel,
    gap: g.gap,
  }));

  if (data.length === 0) return null;

  return (
    <div
      className="gap-radar-chart"
      role="img"
      aria-label="Skill gap radar chart comparing current and target proficiency levels"
    >
      <ResponsiveContainer width="100%" height={420}>
        <RadarChart
          data={data}
          cx="50%"
          cy="50%"
          outerRadius="68%"
          margin={{ top: 24, right: 60, bottom: 24, left: 60 }}
        >
          <PolarGrid stroke="#1e293b" />
          <PolarAngleAxis
            dataKey="skill"
            tick={<RadarAngleTick fill="#cbd5e1" fontSize={12} />}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: '#475569', fontSize: 9 }}
            axisLine={false}
          />
          <Radar
            name="Target"
            dataKey="target"
            stroke="#00ffc8"
            fill="#00ffc8"
            fillOpacity={0.15}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Radar
            name="Current"
            dataKey="current"
            stroke="#f59e0b"
            fill="#f59e0b"
            fillOpacity={0.25}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Tooltip content={<GapRadarTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: 8, fontSize: '0.8rem' }}
            iconType="circle"
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default GapRadarChart;
