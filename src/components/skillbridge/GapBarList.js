import React from 'react';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import './GapBarList.css';

/**
 * GapBarList
 *
 * Renders a horizontal "progress toward target" bar list for the active
 * Skill_Gap list (Req 7.2).
 *
 * Display contract (per-row):
 *   - Label: `<currentLevel> / <targetLevel> (<progress>%)`
 *     where `progress = clamp(round(100 * current / target), 0, 100)` and a
 *     zero `targetLevel` is treated as 100% so the row never divides by
 *     zero or surfaces NaN.
 *   - Bar: a two-tone fill — the progress segment encodes
 *     `current / target` and the remaining-gap segment fills the rest of
 *     the track up to 100% of the target. Together they always span the
 *     full track for a non-zero target, which makes "how far am I from
 *     done?" obvious at a glance.
 *
 * Sort order: progress percent descending — the row closest to its target
 * sits at the top so wins surface first. `computeSkillGapList` returns
 * entries sorted by gap desc, so we re-rank locally for this view.
 *
 * Tooltip / aria-label (Req 7.3): `<name>: current X, target Y, Z% to
 * target`. Surfaces on hover and keyboard focus inside the documented
 * 200ms budget via the native `title` attribute.
 *
 * Two empty-state branches:
 *   1. `requirements.length === 0` → "No skill requirements available
 *      yet" (Req 7.6).
 *   2. `skillAssessment === null` → CTA + "Start assessment" button
 *      (Req 7.4).
 *
 * Validates: Requirements 7.2, 7.3, 7.4, 7.6
 */
function GapBarList({ onStartAssessment }) {
  const { skillGaps, skillAssessment, requirements } = useSkillBridge();

  // Req 7.6 — zero skill requirements means we hide the list entirely and
  // show the empty-state copy. This branch wins over the no-assessment
  // branch because there is literally nothing to assess against.
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return (
      <div className="gap-bar-list gap-bar-list--empty" role="status">
        <p className="gap-bar-list__empty-message">
          No skill requirements available yet
        </p>
      </div>
    );
  }

  // Req 7.4 — requirements exist but the user has not confirmed an
  // assessment yet. Show the CTA + "Start assessment" button.
  if (skillAssessment === null || skillAssessment === undefined) {
    const handleStart = () => {
      if (typeof onStartAssessment === 'function') {
        onStartAssessment();
      }
    };
    return (
      <div className="gap-bar-list gap-bar-list--cta">
        <p className="gap-bar-list__cta-message">
          Complete your skill assessment to see your gap
        </p>
        <button
          type="button"
          className="gap-bar-list__cta-button"
          onClick={handleStart}
        >
          Start assessment
        </button>
      </div>
    );
  }

  // Project Skill_Gap entries onto the row shape this view renders. The
  // `progress` percent is the user-visible metric: how close `current` is
  // to `target` on a 0..100 scale. `targetLevel === 0` is treated as 100%
  // because the user has trivially met a zero target and dividing by
  // zero would otherwise yield NaN/Infinity.
  const gaps = Array.isArray(skillGaps) ? skillGaps : [];
  const rows = gaps.map((entry) => {
    const current =
      Number.isFinite(entry?.currentLevel) ? entry.currentLevel : 0;
    const target =
      Number.isFinite(entry?.targetLevel) ? entry.targetLevel : 0;
    let progress;
    if (target <= 0) {
      progress = 100;
    } else {
      progress = Math.round((100 * current) / target);
    }
    if (progress < 0) progress = 0;
    if (progress > 100) progress = 100;
    return {
      skillId: entry.skillId,
      name: typeof entry.name === 'string' ? entry.name : '',
      current,
      target,
      progress,
    };
  });

  // Sort by progress percent descending — most-progressed first. Tie-break
  // on name case-insensitive ascending so the order is stable across
  // re-renders.
  rows.sort((a, b) => {
    if (b.progress !== a.progress) return b.progress - a.progress;
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  // Req 7.2 — top 5 entries when the list has at least 5, otherwise the
  // full list.
  const topEntries = rows.length > 5 ? rows.slice(0, 5) : rows;

  return (
    <ul className="gap-bar-list" aria-label="Top skill gaps">
      {topEntries.map((entry) => {
        const tooltip =
          `${entry.name}: current ${entry.current}, ` +
          `target ${entry.target}, ${entry.progress}% to target`;
        return (
          <li
            key={entry.skillId}
            className="gap-bar-list__item"
            title={tooltip}
            tabIndex={0}
            aria-label={tooltip}
          >
            <div className="gap-bar-list__row">
              <span className="gap-bar-list__name">{entry.name}</span>
              <span
                className="gap-bar-list__value"
                aria-hidden="true"
              >
                <span className="gap-bar-list__value-raw">
                  {entry.current}
                  <span className="gap-bar-list__value-separator">/</span>
                  {entry.target}
                </span>
                <span className="gap-bar-list__value-pct">
                  {entry.progress}%
                </span>
              </span>
            </div>
            <div
              className="gap-bar-list__track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={entry.progress}
              aria-valuetext={`${entry.progress}% to target`}
            >
              <div
                className="gap-bar-list__fill gap-bar-list__fill--progress"
                style={{ width: `${entry.progress}%` }}
              />
              <div
                className="gap-bar-list__fill gap-bar-list__fill--remaining"
                style={{ width: `${100 - entry.progress}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default GapBarList;
