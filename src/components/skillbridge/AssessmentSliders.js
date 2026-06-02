import React from 'react';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import { clampLevel } from '../../services/skillbridgeService';
import './AssessmentSliders.css';

/**
 * AssessmentSliders
 *
 * Renders one labeled `<input type="range" min="0" max="100" step="1">`
 * per active Skill_Requirement, bound to:
 *
 *   pendingSkillEdits[skillId] ?? skillAssessment?.skills?.[skillId] ?? 50
 *
 * `onChange` calls `updateSkillLevel(skillId, value)` from
 * `SkillBridgeContext`. The action is already O(1) and writes to in-memory
 * `pendingSkillEdits` only — no Firestore round-trip per stroke (Reqs 4.1,
 * 18.1). Empty / non-numeric input is normalized to `0` via `clampLevel`
 * before being staged (Req 4.3).
 *
 * The "Save assessment" button calls `saveAssessment()` and is disabled
 * when `dreamJobId` is null (Req 21.2). The save path itself enforces the
 * remaining persistence invariants (Reqs 4.2, 4.4, 4.5, 4.6, 18.1).
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 18.1, 21.2
 */
function AssessmentSliders() {
  const {
    requirements,
    pendingSkillEdits,
    skillAssessment,
    dreamJobId,
    updateSkillLevel,
    saveAssessment,
    hasUnsavedChanges,
  } = useSkillBridge();

  const reqs = Array.isArray(requirements) ? requirements : [];
  const pending =
    pendingSkillEdits && typeof pendingSkillEdits === 'object'
      ? pendingSkillEdits
      : {};
  const savedSkills =
    skillAssessment && typeof skillAssessment.skills === 'object'
      ? skillAssessment.skills
      : null;

  const saveDisabled =
    typeof dreamJobId !== 'string' || dreamJobId.length === 0;

  const handleSliderChange = (skillId) => (event) => {
    const raw = event.target.value;
    // Empty / non-numeric input → 0 via `clampLevel` (Req 4.3). The
    // service helper also rounds finite numbers to the nearest integer
    // and clamps to [0, 100], so passing the raw string is safe.
    const parsed = raw === '' ? 0 : Number(raw);
    updateSkillLevel(skillId, clampLevel(parsed));
  };

  const handleSave = () => {
    // The button is `disabled` when `dreamJobId` is null, so this guard
    // is belt-and-suspenders against a programmatic click.
    if (saveDisabled) return;
    saveAssessment();
  };

  if (reqs.length === 0) {
    return (
      <div className="assessment-sliders assessment-sliders--empty">
        <p className="assessment-sliders__empty-message">
          No skill requirements to rate yet.
        </p>
      </div>
    );
  }

  return (
    <section
      className="assessment-sliders"
      aria-label="Skill self-assessment"
    >
      <ol className="assessment-sliders__list">
        {reqs.map((req) => {
          if (!req || typeof req.skillId !== 'string') return null;
          const skillId = req.skillId;
          const inputId = `assessment-slider-${skillId}`;

          // Display the staged edit if present, otherwise fall back to
          // the persisted assessment level, otherwise the documented
          // default of 50 (Req 3.2).
          const displayLevel =
            pending[skillId] ??
            (savedSkills ? savedSkills[skillId] : undefined) ??
            50;
          const target =
            typeof req.targetLevel === 'number' ? req.targetLevel : null;

          return (
            <li
              key={skillId}
              className="assessment-sliders__row"
            >
              <div className="assessment-sliders__row-header">
                <label
                  htmlFor={inputId}
                  className="assessment-sliders__label"
                >
                  {req.name || skillId}
                </label>
                <span
                  className="assessment-sliders__value"
                  aria-live="polite"
                >
                  {displayLevel}
                  {target !== null ? (
                    <span className="assessment-sliders__target">
                      {' '}/ Target {target}
                    </span>
                  ) : null}
                </span>
              </div>
              <input
                id={inputId}
                type="range"
                min="0"
                max="100"
                step="1"
                value={displayLevel}
                onChange={handleSliderChange(skillId)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={displayLevel}
                aria-label={`${req.name || skillId} current level`}
                className="assessment-sliders__input"
              />
            </li>
          );
        })}
      </ol>

      <div className="assessment-sliders__footer">
        <button
          type="button"
          className="assessment-sliders__save-button"
          onClick={handleSave}
          disabled={saveDisabled}
          aria-label="Save assessment"
        >
          Save assessment
        </button>
        {hasUnsavedChanges ? (
          <span className="assessment-sliders__unsaved" role="status">
            Unsaved changes
          </span>
        ) : null}
      </div>
    </section>
  );
}

export default AssessmentSliders;
