import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import { useSkillBridge } from '../context/SkillBridgeContext';
import SkillBridgeWizard from '../components/skillbridge/SkillBridgeWizard';
import OfflineBanner from '../components/skillbridge/OfflineBanner';
import './SkillBridge.css';

/**
 * SkillBridge page (`/skillbridge`)
 *
 * Composes the SkillBridge subsystem into a single route. The page owns the
 * access gating, hydration handling, header, and banner stack; the step
 * presentation is delegated to `<SkillBridgeWizard />`:
 *
 *   1. `<OfflineBanner />` — banner stack at the top of the page, kept above
 *      the wizard so banner messages persist across Steps (Req 1.7).
 *   2. `<SkillBridgeWizard />` — the step-based wizard that replaces the
 *      former four stacked sections (DreamJob / Assessment / Gap / Roadmap),
 *      showing exactly one Step at a time with Back/Next navigation and a
 *      progress indicator (Req 1.1).
 *
 * Auth + onboarding gating (Req 5.1, 5.2 / 14.3, 14.4):
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
 * Validates: Requirements 1.1, 1.7, 5.1, 5.2, 6.1, 7.1, 7.2, 7.4
 */

function SkillBridgePage() {
  const { user: authUser, isAuthenticated } = useAuth();
  const userCtx = useUser();
  const sb = useSkillBridge();
  const location = useLocation();
  const activeCareerGoalId = userCtx.user?.activeCareerGoal?.id ?? null;

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

  const { dreamJobId } = sb;

  // Auto-select the user's active career goal as the dream job.
  // If the persisted SkillBridge dream job differs from the dashboard's
  // active career goal, treat the dashboard goal as the source of truth and
  // re-sync the selection.
  useEffect(() => {
    if (
      !sb.isHydrating &&
      activeCareerGoalId &&
      dreamJobId !== activeCareerGoalId
    ) {
      sb.selectDreamJob(activeCareerGoalId);
    }
  }, [sb.isHydrating, dreamJobId, activeCareerGoalId, sb.selectDreamJob]);

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

        <SkillBridgeWizard />
      </div>
    </div>
  );
}

export default SkillBridgePage;
