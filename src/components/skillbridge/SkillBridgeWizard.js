import React, { useState } from 'react';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import {
  STEPS,
  canAdvance,
  canGoBack,
  advanceIndex,
  retreatIndex,
} from './wizardSteps';
import WizardProgress from './WizardProgress';
import DreamJobPicker from './DreamJobPicker';
import AssessmentSliders from './AssessmentSliders';
import GapRadarChart from './GapRadarChart';
import GapBarList from './GapBarList';
import GapClosedCelebration from './GapClosedCelebration';
import RoadmapView from './RoadmapView';
import './SkillBridgeWizard.css';

/**
 * SkillBridgeWizard
 *
 * Presentational shell that turns the SkillBridge subsystem from a single
 * long scrolling page into a step-based wizard that shows exactly one Step
 * at a time with a progress indicator and Back/Next controls (Req 1.1).
 *
 * The four ordered Steps — `DreamJob`, `Assessment`, `Gap`, `Roadmap`
 * (Req 1.2) — reuse the existing Step_Components unchanged (Req 1.4):
 *   - `DreamJob`   → `<DreamJobPicker />`
 *   - `Assessment` → `<AssessmentSliders />` (single step, all sliders, the
 *     existing in-component Save trigger preserved — Req 1.5, 6.3)
 *   - `Gap`        → `<GapRadarChart />` + `<GapBarList />` +
 *     `<GapClosedCelebration />`, mirroring the single-page
 *     `skillbridge-page__gap-grid` layout
 *   - `Roadmap`    → `<RoadmapView />` (single view, not paginated — Req 1.6)
 *
 * Design constraints honored here:
 *   - The ONLY new state is the ephemeral `activeStepIndex`, held in
 *     component state, initialized to `0` (`DreamJob`). It is never seeded
 *     from persisted state and never written to context or Firestore — the
 *     step position is transient navigation UI, not user data (Req 2.7,
 *     6.2).
 *   - All navigation goes through `setActiveStepIndex` using the pure
 *     helpers in `wizardSteps.js`. The wizard never calls a context action
 *     and never clears `dreamJobId`, `requirements`, `skillAssessment`,
 *     `pendingSkillEdits`, or `hasUnsavedChanges` (Req 2.7, 6.2).
 *   - Only native form-associated `<button>` controls are introduced (no
 *     portals, no `<div role="button">`) so a `<fieldset disabled>`
 *     read-only-preview boundary disables them transitively (Req 5.3).
 *   - `<OfflineBanner />` is intentionally NOT rendered here — it stays in
 *     the page above the wizard so the banner stack persists across Steps
 *     (Req 1.7, handled by `SkillBridge.js`).
 *
 * Live gap recompute (Req 7.1, 7.3) and badge awarding (Req 7.4) are owned
 * by `SkillBridgeContext` and are step-independent; the wizard only gates
 * which components render, not when the derived state recomputes.
 *
 * Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3,
 *   2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 6.2, 6.3, 7.3
 */
function SkillBridgeWizard() {
  const { dreamJobId, skillAssessment } = useSkillBridge();

  // The only new state — ephemeral wizard view-state. Initialized to the
  // first Step (`DreamJob`); never seeded from persisted state and never
  // persisted back (Req 2.7, 6.2).
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  // The read-only projection of context used purely for gating. These
  // fields are the SAME flags that drive section visibility in the
  // single-page layout (`showAssessment` / `showRoadmap`), so the wizard
  // never reaches a Step that layout would have hidden (Req 4.6).
  const gateState = { dreamJobId, skillAssessment };

  const activeStep = STEPS[activeStepIndex];
  const isLastStep = activeStepIndex >= STEPS.length - 1;
  const showBack = canGoBack(activeStepIndex);
  const nextDisabled = !canAdvance(activeStepIndex, gateState);

  // Navigation handlers — the only state mutations, all routed through the
  // pure helpers. A blocked advance is a no-op (Req 2.5, 4.1, 4.2).
  const goNext = () => {
    setActiveStepIndex((i) => advanceIndex(i, gateState));
  };

  const goBack = () => {
    setActiveStepIndex((i) => retreatIndex(i));
  };

  // Empty-state CTA target for `<GapBarList>`. Replaces the single-page
  // `handleStartAssessment` scroll helper: jump to the `Assessment` Step
  // when a dream job is set, otherwise back to the `DreamJob` Step so the
  // user picks one first (preserves the old empty-state CTA semantics).
  const goToAssessment = () => {
    const hasDreamJob =
      typeof dreamJobId === 'string' && dreamJobId.length > 0;
    const targetLabel = hasDreamJob ? 'Assessment' : 'DreamJob';
    const targetIndex = STEPS.indexOf(targetLabel);
    setActiveStepIndex(targetIndex >= 0 ? targetIndex : 0);
  };

  // Active Step body — exactly one of the four segments renders (Req 1.1).
  const renderActiveStep = () => {
    switch (activeStep) {
      case 'DreamJob':
        return <DreamJobPicker />;
      case 'Assessment':
        // Single Step, all sliders; the in-component Save trigger is
        // preserved (Req 1.5, 6.3).
        return <AssessmentSliders />;
      case 'Gap':
        // Mirror the single-page `skillbridge-page__gap-grid` layout.
        return (
          <>
            <div className="skillbridge-page__gap-grid">
              <div className="skillbridge-page__gap-radar">
                <GapRadarChart />
              </div>
              <div className="skillbridge-page__gap-bars">
                <GapBarList onStartAssessment={goToAssessment} />
              </div>
            </div>
            <GapClosedCelebration />
          </>
        );
      case 'Roadmap':
        // Single view, not paginated by phase (Req 1.6).
        return <RoadmapView />;
      default:
        return null;
    }
  };

  return (
    <div className="skillbridge-wizard">
      <WizardProgress steps={STEPS} activeIndex={activeStepIndex} />

      <div
        className="skillbridge-wizard__step"
        aria-label={`Step ${activeStepIndex + 1} of ${STEPS.length}: ${activeStep}`}
      >
        {renderActiveStep()}
      </div>

      <div className="skillbridge-wizard__nav">
        {showBack ? (
          <button
            type="button"
            className="skillbridge-wizard__nav-button skillbridge-wizard__nav-button--back"
            onClick={goBack}
          >
            Back
          </button>
        ) : (
          // Spacer keeps "Next" right-aligned when "Back" is hidden on the
          // first Step (Req 2.3).
          <span className="skillbridge-wizard__nav-spacer" aria-hidden="true" />
        )}

        {!isLastStep ? (
          <button
            type="button"
            className="skillbridge-wizard__nav-button skillbridge-wizard__nav-button--next"
            onClick={goNext}
            disabled={nextDisabled}
          >
            Next
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default SkillBridgeWizard;
