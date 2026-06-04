import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import {
  STEPS,
  canAdvance,
  canGoBack,
  advanceIndex,
  retreatIndex,
  deriveInitialStepIndex,
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
 *     6.2). The skip-to-roadmap behavior (Group A) is a *derivation* of the
 *     durable context state at mount, finalized exactly once per mount via
 *     a ref guard, NOT a new persisted field (Req 3.3, 3.5).
 *   - All navigation goes through `setActiveStepIndex` using the pure
 *     helpers in `wizardSteps.js`. The wizard never calls a context action
 *     and never clears `dreamJobId`, `requirements`, `skillAssessment`,
 *     `pendingSkillEdits`, or `hasUnsavedChanges` (Req 2.7, 6.2, 3.2).
 *   - Only native form-associated `<button>` controls are introduced (no
 *     portals, no `<div role="button">`) so a `<fieldset disabled>`
 *     read-only-preview boundary disables them transitively (Req 5.3, 2.7).
 *   - `<OfflineBanner />` is intentionally NOT rendered here — it stays in
 *     the page above the wizard so the banner stack persists across Steps
 *     (Req 1.7, handled by `SkillBridge.js`).
 *
 * Group A — Skip-to-Roadmap flow for returning users:
 *   - An initial-step effect derives the FIRST `activeStepIndex` from the
 *     hydrated context (`isHydrating`, `dreamJobId`, `skillAssessment`):
 *     a Returning_User_State lands on `Roadmap` (index 3), a
 *     First_Time_User_State on `DreamJob` (index 0). It is finalized
 *     exactly once per mount (`finalizedRef`) and never fires while
 *     `isHydrating === true`, so a transiently-empty pre-hydration state
 *     never forces a returning user onto `DreamJob`, and user-initiated
 *     Back/Next are never overridden (Req 1.1, 1.2, 1.4, 1.5, 1.7, 1.8,
 *     3.5).
 *   - The `Roadmap` step header exposes "Edit dream job" (navigates to
 *     `/dashboard`, the existing change-goal affordance) and "Edit
 *     assessment" (jumps to the `Assessment` step) controls (Req 2.1, 2.2,
 *     2.3, 2.4, 2.6). Both are native `<button>`s honoring the read-only
 *     boundary (Req 2.7).
 *   - A Return_To_Roadmap effect returns the user to `Roadmap` once a
 *     Confirmed_Assessment is produced after entering `Assessment` via the
 *     edit control; a blocked save keeps the user on `Assessment` (Req 2.5,
 *     2.8).
 *
 * Live gap recompute (Req 7.1, 7.3) and badge awarding (Req 7.4) are owned
 * by `SkillBridgeContext` and are step-independent; the wizard only gates
 * which components render, not when the derived state recomputes.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1,
 *   2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 6.2, 6.3,
 *   7.3
 */
function SkillBridgeWizard() {
  const { isHydrating, dreamJobId, skillAssessment } = useSkillBridge();
  const navigate = useNavigate();

  // The only new state — ephemeral wizard view-state. Initialized to the
  // first Step (`DreamJob`); never seeded from persisted state and never
  // persisted back (Req 2.7, 6.2, 3.3).
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  // Initial-step finalized once per mount (Req 1.7, 1.8). Once `true`, the
  // hydration-anchored initial selection is never re-applied, so a
  // user-initiated Back/Next is preserved (Req 1.8, 3.5).
  const finalizedRef = useRef(false);

  // Tracks whether the user entered the `Assessment` Step *via* the
  // Edit_Assessment_Control, gating the Return_To_Roadmap behavior
  // (Req 2.5, 2.8).
  const editingAssessmentRef = useRef(false);

  // ── Initial-step derivation effect (Group A) ───────────────────────────
  // Derives the FIRST `activeStepIndex` from the hydrated durable state,
  // finalized exactly once per mount:
  //   - finalized already  → never re-apply (Req 1.8, 3.5).
  //   - isHydrating === true → do NOT finalize; a transiently-empty
  //     pre-hydration state must not force a returning user onto `DreamJob`
  //     (Req 1.4).
  //   - otherwise → land a Returning_User_State on `Roadmap` (3) and a
  //     First_Time_User_State on `DreamJob` (0), then finalize (Req 1.1,
  //     1.2, 1.5, 1.7). The initial step is derived here at mount, never
  //     restored from framework state restoration / hot-reload / hydration
  //     (Req 3.5).
  useEffect(() => {
    if (finalizedRef.current === true) {
      return;
    }
    if (isHydrating === true) {
      return;
    }
    const idx = deriveInitialStepIndex({ dreamJobId, skillAssessment });
    setActiveStepIndex(idx);
    finalizedRef.current = true;
  }, [isHydrating, dreamJobId, skillAssessment]);

  // The read-only projection of context used purely for gating. These
  // fields are the SAME flags that drive section visibility in the
  // single-page layout (`showAssessment` / `showRoadmap`), so the wizard
  // never reaches a Step that layout would have hidden (Req 4.6).
  const gateState = { dreamJobId, skillAssessment };

  const activeStep = STEPS[activeStepIndex];
  const isLastStep = activeStepIndex >= STEPS.length - 1;
  const showBack = canGoBack(activeStepIndex);
  const nextDisabled = !canAdvance(activeStepIndex, gateState);

  // ── Return_To_Roadmap effect (Group A) ─────────────────────────────────
  // Observes `skillAssessment` ONLY: it must fire on the save *transition*
  // (a Confirmed_Assessment produced by `saveAssessment`), not merely on
  // entering the `Assessment` Step. A returning user already has a non-null
  // `skillAssessment`, so depending on `activeStep` here would bounce them
  // straight back to `Roadmap` the instant they open the editor. By keying
  // the effect to `skillAssessment` alone, entering `Assessment` is a no-op
  // and the return happens exactly when the assessment value changes.
  //
  // When the user entered `Assessment` via the Edit_Assessment_Control and
  // a Confirmed_Assessment is subsequently produced (`skillAssessment` is
  // neither null nor undefined), return them to the `Roadmap` Step and
  // clear the editing flag (Req 2.5). The `skillAssessment` transition is
  // the same signal `stepReachable(3, …)` uses, so this fires exactly when
  // the `Roadmap` Step first becomes reachable post-edit. A blocked save
  // (e.g. empty `dreamJobId`, no Confirmed_Assessment) leaves
  // `skillAssessment` unchanged so the wizard stays on `Assessment`
  // (Req 2.8). `activeStep` is read from the closure of the render that
  // committed the `skillAssessment` change (still `Assessment` at that
  // point), so the guard holds without re-running on step changes.
  //
  // NOTE: this effect intentionally lists only `skillAssessment` in its
  // dependency array. It reads `activeStep` / `editingAssessmentRef` /
  // `setActiveStepIndex` from the render closure on purpose — adding
  // `activeStep` as a dependency would make a returning user (who already
  // has a non-null `skillAssessment`) get bounced straight back to the
  // `Roadmap` Step the instant they open the editor, defeating Req 2.5.
  useEffect(() => {
    if (
      editingAssessmentRef.current === true &&
      activeStep === 'Assessment' &&
      skillAssessment !== null &&
      skillAssessment !== undefined
    ) {
      editingAssessmentRef.current = false;
      setActiveStepIndex(STEPS.indexOf('Roadmap'));
    }
    // Intentionally observes `skillAssessment` only (see note above).
  }, [skillAssessment]);

  // Navigation handlers — the only state mutations, all routed through the
  // pure helpers. A blocked advance is a no-op (Req 2.5, 4.1, 4.2). Neither
  // handler calls a context action or clears any durable context field
  // (Req 3.2, 3.3).
  const goNext = () => {
    setActiveStepIndex((i) => advanceIndex(i, gateState));
  };

  const goBack = () => {
    setActiveStepIndex((i) => retreatIndex(i));
  };

  // ── Roadmap-header edit controls (Group A) ─────────────────────────────
  // "Edit dream job" reuses `DreamJobPicker`'s existing change-goal
  // affordance (navigation to `/dashboard`) so the dream job is edited
  // through the existing active-career-goal flow (Req 2.4).
  const handleEditDreamJob = () => {
    navigate('/dashboard');
  };

  // "Edit assessment" marks that the user is entering `Assessment` via the
  // edit control (gating Return_To_Roadmap) and jumps to the `Assessment`
  // Step (index 1) (Req 2.3).
  const handleEditAssessment = () => {
    editingAssessmentRef.current = true;
    setActiveStepIndex(STEPS.indexOf('Assessment'));
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
        // Single view, not paginated by phase (Req 1.6). The Roadmap Step
        // header exposes the edit controls (Req 2.1, 2.6). Both are native
        // `<button>`s so a `<fieldset disabled>` read-only-preview boundary
        // disables them transitively and they invoke nothing in that mode
        // (Req 2.7).
        return (
          <>
            <div className="skillbridge-wizard__roadmap-edit-controls">
              <button
                type="button"
                className="skillbridge-wizard__edit-button"
                onClick={handleEditDreamJob}
              >
                Edit dream job
              </button>
              <button
                type="button"
                className="skillbridge-wizard__edit-button"
                onClick={handleEditAssessment}
              >
                Edit assessment
              </button>
            </div>
            <RoadmapView />
          </>
        );
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
