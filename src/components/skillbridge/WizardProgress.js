import React from 'react';
import './WizardProgress.css';

/**
 * WizardProgress
 *
 * Progress indicator for the SkillBridge wizard. Renders the ordered list
 * of step labels and visually distinguishes the currently active step.
 *
 * Props:
 *   - steps: string[]  — ordered step labels (the `STEPS` sequence from
 *     `wizardSteps.js`: ['DreamJob', 'Assessment', 'Gap', 'Roadmap']).
 *   - activeIndex: number — index of the currently active step.
 *
 * Behavior / accessibility:
 *   - Rendered as a `<nav aria-label="SkillBridge progress">` wrapping an
 *     ordered list so assistive tech announces the sequence and position
 *     (Req 3.1, 3.4).
 *   - The active step carries `aria-current="step"` plus an `is-active`
 *     class so it is visually and programmatically distinguished
 *     (Req 3.2). Updating `activeIndex` is a plain React re-render that
 *     repaints the indicator well within the 200ms budget (Req 3.3).
 *   - Step items are non-interactive labels by default — the wizard moves
 *     via its Back/Next controls, not by clicking steps. If a step item is
 *     ever made interactive it MUST be a native `<button>` so a
 *     `<fieldset disabled>` read-only-preview boundary disables it
 *     transitively (Req 5.3); a `<div role="button">`/`<span onClick>`
 *     would escape that boundary and is intentionally avoided here.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

/**
 * Turn an internal step identifier into a human-readable label by inserting
 * a space at camelCase boundaries (e.g. `DreamJob` → `Dream Job`). The
 * `STEPS` identifiers stay untouched for navigation gating and tests; this
 * only affects what the user sees in the progress indicator.
 *
 * @param {string} label
 * @returns {string}
 */
function formatStepLabel(label) {
  return String(label).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function WizardProgress({ steps, activeIndex }) {
  const stepList = Array.isArray(steps) ? steps : [];
  const activeNum =
    typeof activeIndex === 'number' && Number.isFinite(activeIndex)
      ? activeIndex
      : -1;

  if (stepList.length === 0) {
    return null;
  }

  return (
    <nav className="wizard-progress" aria-label="SkillBridge progress">
      <ol className="wizard-progress__list">
        {stepList.map((label, index) => {
          const isActive = index === activeNum;
          // Only the currently active step is highlighted. Preceding
          // ("completed") steps render with the same neutral style as
          // upcoming steps, so the indicator marks position — not progress.
          const className =
            'wizard-progress__step' + (isActive ? ' is-active' : '');
          return (
            <li
              key={`${label}-${index}`}
              className={className}
              aria-current={isActive ? 'step' : undefined}
              data-step-index={index}
            >
              <span className="wizard-progress__marker" aria-hidden="true">
                {index + 1}
              </span>
              <span className="wizard-progress__label">
                {formatStepLabel(label)}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default WizardProgress;
