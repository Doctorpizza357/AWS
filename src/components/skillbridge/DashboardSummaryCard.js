import React from 'react';
import { Link } from 'react-router-dom';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import careers from '../../data/careers';
import './DashboardSummaryCard.css';

/**
 * `DashboardSummaryCard`
 *
 * Lightweight Dashboard widget summarizing the user's SkillBridge state
 * (Req 13). Reads `currentRoadmap`, `roadmapCompletionPct`, `skillGaps`,
 * `dreamJobId`, and `allGapsClosed` from `SkillBridgeContext` and renders
 * one of two states:
 *
 * 1. CTA card "Start SkillBridge" → linking to `/skillbridge`, shown when
 *    no `currentRoadmap` is set (Req 13.2) OR when the current roadmap's
 *    phases collectively contain zero `projectIds` (Req 13.3).
 * 2. Summary card → shows the Dream_Job title resolved from
 *    `src/data/careers.js`, the roadmap completion percentage
 *    (Req 13.1, 13.4, 13.5), the name of the largest current gap skill
 *    (the first entry of `skillGaps`, Req 13.1), and a link to
 *    `/skillbridge`.
 *
 * When `allGapsClosed` is true, or when `skillGaps` is empty, the gap
 * skill slot is replaced with the message "All gaps closed" instead of a
 * skill name (Req 13.6).
 */
function DashboardSummaryCard() {
  const {
    currentRoadmap,
    roadmapCompletionPct,
    skillGaps,
    dreamJobId,
    allGapsClosed,
  } = useSkillBridge();

  const phases = Array.isArray(currentRoadmap?.phases)
    ? currentRoadmap.phases
    : [];
  const totalProjectIds = phases.reduce(
    (acc, phase) =>
      acc + (Array.isArray(phase?.projectIds) ? phase.projectIds.length : 0),
    0,
  );

  // Req 13.2 + Req 13.3 — render the CTA card when no roadmap exists or
  // when the roadmap contains zero projects in total.
  if (currentRoadmap === null || totalProjectIds === 0) {
    return (
      <section
        className="skillbridge-summary-card skillbridge-summary-card--cta"
        aria-label="SkillBridge call to action"
      >
        <div className="skillbridge-summary-card__cta-body">
          <h3 className="skillbridge-summary-card__cta-title">
            Build your skill bridge
          </h3>
          <p className="skillbridge-summary-card__cta-subtitle">
            Pick a dream job and generate a personalized roadmap.
          </p>
        </div>
        <Link
          to="/skillbridge"
          className="skillbridge-summary-card__cta-link"
        >
          Start SkillBridge
        </Link>
      </section>
    );
  }

  // Req 13.1 — resolve the Dream_Job title from `careers.js`. The picker
  // already validates `dreamJobId` against this catalog, so the lookup
  // should hit; we fall back to "Your dream job" if it doesn't to avoid
  // breaking the widget on stale data.
  const career = Array.isArray(careers)
    ? careers.find((c) => c && c.id === dreamJobId)
    : null;
  const dreamJobTitle = career?.title || 'Your dream job';

  // Req 13.6 — show "All gaps closed" instead of a skill name when the
  // active gap list is empty or every gap is 0.
  const gaps = Array.isArray(skillGaps) ? skillGaps : [];
  const topGap = gaps.length > 0 ? gaps[0] : null;
  const showAllClosed = allGapsClosed || gaps.length === 0;
  const topGapLabel = showAllClosed
    ? 'All gaps closed'
    : topGap?.name || 'Skill gap';

  // Req 13.4 — `roadmapCompletionPct` is computed by the context (pure
  // helper from skillbridgeService). It already handles the zero-phase
  // case (Req 13.5) by returning 0.
  const completionPct =
    Number.isFinite(roadmapCompletionPct) ? roadmapCompletionPct : 0;

  return (
    <section
      className="skillbridge-summary-card"
      aria-label="SkillBridge progress summary"
    >
      <div className="skillbridge-summary-card__header">
        <span className="skillbridge-summary-card__eyebrow">SkillBridge</span>
        <h3 className="skillbridge-summary-card__title">{dreamJobTitle}</h3>
      </div>

      <dl className="skillbridge-summary-card__stats">
        <div className="skillbridge-summary-card__stat">
          <dt className="skillbridge-summary-card__stat-label">
            Roadmap completion
          </dt>
          <dd className="skillbridge-summary-card__stat-value">
            {completionPct}%
          </dd>
        </div>
        <div className="skillbridge-summary-card__stat">
          <dt className="skillbridge-summary-card__stat-label">
            {showAllClosed ? 'Status' : 'Top gap'}
          </dt>
          <dd
            className={
              showAllClosed
                ? 'skillbridge-summary-card__stat-value skillbridge-summary-card__stat-value--closed'
                : 'skillbridge-summary-card__stat-value'
            }
          >
            {topGapLabel}
          </dd>
        </div>
      </dl>

      <Link
        to="/skillbridge"
        className="skillbridge-summary-card__link"
      >
        Open SkillBridge
      </Link>
    </section>
  );
}

export default DashboardSummaryCard;
