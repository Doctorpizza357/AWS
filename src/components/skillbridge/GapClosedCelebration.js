import React, { useEffect, useRef } from 'react';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import { useUser } from '../../context/UserContext';
import { getIconComponent } from '../../utils/iconMap';
import './GapClosedCelebration.css';

/**
 * GapClosedCelebration
 *
 * Displays a "Gap closed" confirmation card and triggers the
 * `skillbridge-gap-closer` badge award when the active Skill_Gap list has
 * at least one entry and every gap is `0`.
 *
 * The component is fully driven by `useSkillBridge().allGapsClosed`, which
 * is recomputed in the provider whenever the Skill_Assessment or active
 * Skill_Requirements set changes (Req 6.4). When `allGapsClosed === false`
 * the component renders `null`.
 *
 * Badge award (Req 20.4):
 *   The component watches for an `allGapsClosed` transition from `false`
 *   → `true` via a `useRef` and invokes `earnBadge` exactly once per
 *   transition. `earnBadge` itself is idempotent at the UserContext level
 *   (Req 20.7) and the SkillBridgeContext also awards this badge in
 *   `applyInferredGain` / completion paths (task 32) — the call here is a
 *   defense-in-depth hook so the celebration UI cannot render without
 *   recording the achievement.
 *
 * Validates: Requirements 6.3, 6.5, 20.4
 */

const GAP_CLOSER_BADGE = Object.freeze({
  id: 'skillbridge-gap-closer',
  name: 'Gap Closer',
  icon: 'badge-gap-closer',
  description: 'Closed every skill gap for your dream job',
});

function GapClosedCelebration() {
  const { allGapsClosed } = useSkillBridge();
  const { earnBadge } = useUser();

  // Track the previous `allGapsClosed` value across renders so the badge
  // award only fires on the false → true transition. Initialised to
  // `false` so the very first render with `allGapsClosed === true` is
  // treated as a transition (the badge is still idempotent per Req 20.7
  // even if the context already awarded it on an earlier action).
  const prevAllGapsClosedRef = useRef(false);

  useEffect(() => {
    if (allGapsClosed && !prevAllGapsClosedRef.current) {
      if (typeof earnBadge === 'function') {
        try {
          earnBadge(GAP_CLOSER_BADGE);
        } catch (_err) {
          // `earnBadge` failing is non-fatal — the celebration UI still
          // renders so the user sees their achievement. The badge will be
          // awarded again on the next qualifying state change.
        }
      }
    }
    prevAllGapsClosedRef.current = Boolean(allGapsClosed);
  }, [allGapsClosed, earnBadge]);

  if (!allGapsClosed) return null;

  const TrophyIcon = getIconComponent('badge-gap-closer');

  return (
    <div
      className="gap-closed-celebration"
      role="status"
      aria-live="polite"
    >
      <div className="gap-closed-celebration-icon" aria-hidden="true">
        <TrophyIcon />
      </div>
      <div className="gap-closed-celebration-body">
        <h3 className="gap-closed-celebration-title">
          <span aria-hidden="true">🎉</span> Gap closed!
        </h3>
        <p className="gap-closed-celebration-message">
          You&apos;ve matched the target levels for every skill in your
          dream job.
        </p>
      </div>
    </div>
  );
}

export default GapClosedCelebration;
