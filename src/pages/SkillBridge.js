import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import { useSkillBridge } from '../context/SkillBridgeContext';
import DreamJobPicker from '../components/skillbridge/DreamJobPicker';
import AssessmentSliders from '../components/skillbridge/AssessmentSliders';
import GapRadarChart from '../components/skillbridge/GapRadarChart';
import GapBarList from '../components/skillbridge/GapBarList';
import GapClosedCelebration from '../components/skillbridge/GapClosedCelebration';
import RoadmapView from '../components/skillbridge/RoadmapView';
import OfflineBanner from '../components/skillbridge/OfflineBanner';
import './SkillBridge.css';

/**
 * SkillBridge page (`/skillbridge`)
 *
 * Composes the SkillBridge subsystem into a single route:
 *
 *   1. `<OfflineBanner />` — banner stack at the top of the page (Req 21.4 /
 *      Req 19.4).
 *   2. `<DreamJobPicker />` — always visible. When no dream job is selected,
 *      this is the only call to action (Req 1.1).
 *   3. `<AssessmentPanel>` — assessment sliders, visible only when a dream
 *      job is selected (Req 4.1).
 *   4. `<GapPanel>` — radar + horizontal bars + gap-closed celebration,
 *      visible when there is at least one Skill_Requirement (Req 7).
 *   5. `<RoadmapView />` — visible once both a dream job and an assessment
 *      exist (Req 8 / Req 9).
 *
 * Auth + onboarding gating (Req 14.3, 14.4):
 *   - Unauthenticated → `<Navigate to="/login" replace />`.
 *   - Authenticated AND not onboarded → `<Navigate to="/onboarding" replace />`.
 *
 * Unsaved-changes navigation guard (Req 4.6): the `beforeunload` listener
 * registered in `SkillBridgeContext` covers tab close, refresh, and
 * external navigation. The intra-app `useBlocker` flow that
 * react-router-dom v6.4+ ships only works under a data router
 * (`createBrowserRouter`), and this app uses `<BrowserRouter>`, so the
 * hook would throw. We rely on the `beforeunload` guard alone here; an
 * in-app blocker can be revisited when the router migrates.
 *
 * Validates: Requirements 14.3, 14.4, 14.5, 14.6, 4.6
 */

function SkillBridgePage() {
  const { user: authUser, isAuthenticated } = useAuth();
  const userCtx = useUser();
  const sb = useSkillBridge();
  const location = useLocation();

  // Req 14.3 — unauthenticated users are redirected to /login *before* any
  // other gating. `replace` keeps `/skillbridge` out of history so a back
  // press doesn't reload the gated page.
  if (!isAuthenticated || !authUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Req 14.4 — authenticated but not onboarded users are redirected to
  // `/onboarding`. The Req 14.5 fallback (read-only preview when
  // `/onboarding` is unregistered) is handled at the App.js level by
  // `task 48`; from inside this component we always navigate.
  const isOnboarded =
    userCtx && userCtx.user && userCtx.user.isOnboarded === true;
  if (!isOnboarded) {
    return <Navigate to="/onboarding" replace state={{ from: location }} />;
  }

  const {
    dreamJobId,
    requirements,
    skillAssessment,
  } = sb;

  const hasRequirements =
    Array.isArray(requirements) && requirements.length > 0;
  const showAssessment = typeof dreamJobId === 'string' && dreamJobId.length > 0;
  const showRoadmap = showAssessment && skillAssessment !== null
    && skillAssessment !== undefined;

  // Empty-state CTA target for `<GapBarList>` — focuses the assessment
  // panel when the user clicks "Start assessment" from the empty list
  // state (Req 7.4). When no dream job exists yet, scroll to the picker
  // instead so the user can pick one first.
  const handleStartAssessment = () => {
    const targetId = showAssessment ? 'skillbridge-assessment' : 'skillbridge-dreamjob';
    const node = document.getElementById(targetId);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="skillbridge-page">
      <div className="skillbridge-page__container">
        <header className="skillbridge-page__header">
          <h1 className="skillbridge-page__title">SkillBridge</h1>
          <p className="skillbridge-page__lead">
            Compare your current skills against your dream job and follow a
            personalized weekly roadmap to close the gap.
          </p>
        </header>

        <OfflineBanner />

        <section
          id="skillbridge-dreamjob"
          className="skillbridge-page__section skillbridge-page__section--dreamjob"
          aria-label="Dream job"
        >
          <DreamJobPicker />
        </section>

        {showAssessment ? (
          <section
            id="skillbridge-assessment"
            className="skillbridge-page__section skillbridge-page__section--assessment"
            aria-label="Skill assessment"
          >
            <AssessmentSliders />
          </section>
        ) : null}

        {hasRequirements ? (
          <section
            id="skillbridge-gap"
            className="skillbridge-page__section skillbridge-page__section--gap"
            aria-label="Skill gap"
          >
            <div className="skillbridge-page__gap-grid">
              <div className="skillbridge-page__gap-radar">
                <GapRadarChart />
              </div>
              <div className="skillbridge-page__gap-bars">
                <GapBarList onStartAssessment={handleStartAssessment} />
              </div>
            </div>
            <GapClosedCelebration />
          </section>
        ) : null}

        {showRoadmap ? (
          <section
            id="skillbridge-roadmap"
            className="skillbridge-page__section skillbridge-page__section--roadmap"
            aria-label="Roadmap"
          >
            <RoadmapView />
          </section>
        ) : null}
      </div>
    </div>
  );
}

export default SkillBridgePage;
