import React, { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import { useSkillBridge } from '../context/SkillBridgeContext';
import { useAvatar } from '../context/AvatarContext';
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

// Map STEPS index to the wizardStep values used by checkpoint messages
const STEP_INDEX_TO_WIZARD_STEP = ['dream-job', 'assessment', 'gap-analysis', 'roadmap'];

function deriveWizardStep(dreamJobId, skillAssessment) {
  const hasDreamJob = typeof dreamJobId === 'string' && dreamJobId.length > 0;
  const hasAssessment = skillAssessment !== null && skillAssessment !== undefined;
  if (hasDreamJob && hasAssessment) return STEP_INDEX_TO_WIZARD_STEP[3]; // roadmap
  if (hasDreamJob) return STEP_INDEX_TO_WIZARD_STEP[1]; // assessment
  return STEP_INDEX_TO_WIZARD_STEP[0]; // dream-job
}

function SkillBridgePage() {
  const { user: authUser, isAuthenticated } = useAuth();
  const userCtx = useUser();
  const sb = useSkillBridge();
  const { triggerCheckpoint } = useAvatar();
  const { t } = useTranslation();
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

  // ── Avatar checkpoint trigger (multicultural-avatars spec, Req 4.1, 4.2, 4.4) ──
  useEffect(() => {
    const wizardStep = deriveWizardStep(sb.dreamJobId, sb.skillAssessment);
    const careers = require('../data/careers').default;
    const dreamJobCareer = careers && sb.dreamJobId
      ? careers.find((c) => c.id === sb.dreamJobId)
      : null;

    // Build skill gap metrics for the AI prompt
    const skillGaps = [];
    if (sb.skillAssessment && Array.isArray(sb.requirements)) {
      for (const req of sb.requirements.slice(0, 5)) {
        const level = sb.skillAssessment?.skills?.[req.skillId] ?? 50;
        const target = req.targetLevel ?? 80;
        const gap = Math.max(0, target - level);
        if (gap > 0) {
          skillGaps.push({ name: req.skillId, gap });
        }
      }
    }

    // Compute roadmap progress
    let roadmapProgress;
    if (sb.currentRoadmap && Array.isArray(sb.currentRoadmap.phases)) {
      const totalPhases = sb.currentRoadmap.phases.length;
      const completedPhases = sb.currentRoadmap.phases.filter(
        (p) => p.completedAt
      ).length;
      roadmapProgress = totalPhases > 0
        ? Math.round((completedPhases / totalPhases) * 100)
        : undefined;
    }

    triggerCheckpoint('skillbridge', {
      wizardStep,
      dreamJob: dreamJobCareer?.title || undefined,
      userName: userCtx.user?.profile?.name || userCtx.user?.name || undefined,
      skillGaps: skillGaps.length > 0 ? skillGaps : undefined,
      roadmapProgress,
      xpLevel: userCtx.user?.progress?.level,
      currentXp: userCtx.user?.progress?.xp,
    });
  }, []); // eslint-disable-line

  // ── Event-based trigger: assessment saved ──
  const prevAssessmentRef = useRef(sb.skillAssessment);
  useEffect(() => {
    if (
      prevAssessmentRef.current === null &&
      sb.skillAssessment !== null
    ) {
      // User just completed their first assessment
      const careers = require('../data/careers').default;
      const dreamJobCareer = careers && sb.dreamJobId
        ? careers.find((c) => c.id === sb.dreamJobId)
        : null;

      triggerCheckpoint('assessment-complete', {
        eventId: `assessment-${Date.now()}`,
        dreamJob: dreamJobCareer?.title || undefined,
        userName: userCtx.user?.profile?.name || undefined,
        xpLevel: userCtx.user?.progress?.level,
      });
    }
    prevAssessmentRef.current = sb.skillAssessment;
  }, [sb.skillAssessment]); // eslint-disable-line

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
          <h1 className="skillbridge-page__title">{t('skillbridge.title')}</h1>
          <p className="skillbridge-page__lead">
            {t('skillbridge.lead')}
          </p>
        </header>

        <OfflineBanner />

        <SkillBridgeWizard />
      </div>
    </div>
  );
}

export default SkillBridgePage;
