import React, { useEffect, useMemo, useState } from 'react';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import './OfflineBanner.css';

/**
 * OfflineBanner
 *
 * Renders the active banners stack from `SkillBridgeContext` plus any
 * non-expired success toasts. One reachability condition surfaces a
 * banner even when the context's `banners` array doesn't include it
 * directly:
 *
 *   - `isFirestoreReachable === 'unreachable'` → the "Working offline"
 *     warning (Req 21.4). When Firestore recovers (`'reachable'`) the
 *     banner disappears (Req 21.6).
 *
 * The `using-offline-requirements` banner is intentionally suppressed at
 * the render layer — the context still tracks the fallback state, but
 * the user-visible "Using offline requirements" pop-up is hidden.
 *
 * Each banner is rendered as a styled box keyed by `kind`:
 *   - `error`   → red surface
 *   - `warning` → amber surface
 *   - `info`    → blue surface
 *
 * Dismissal: the context doesn't yet expose a `dismissBanner` action, so
 * dismissal is local — clicking the dismiss button adds the banner id to
 * a `dismissedIds` set and the banner is filtered out of the render
 * tree. A subsequent state change in context that re-emits the same id
 * will re-introduce the banner; that's acceptable for now and matches
 * Req 21.6 (banners persist until the underlying condition resolves).
 *
 * Toasts: `state.toasts` are rendered as auto-fading success boxes. Only
 * toasts whose `expiresAt` is still in the future are surfaced; a small
 * timer re-renders the component as the next toast expires so stale
 * toasts disappear without a parent re-render.
 *
 * Returns `null` when there are no visible banners and no live toasts —
 * keeps the DOM clean during the steady-state.
 *
 * Validates: Requirements 21.4, 21.6
 */
function OfflineBanner() {
  const {
    banners,
    toasts,
    isFirestoreReachable,
  } = useSkillBridge();

  // Dismissed banner ids — local only. The context-driven banner stream
  // is the source of truth, so re-introducing an id that the user
  // dismissed is acceptable (Req 21.6).
  const [dismissedIds, setDismissedIds] = useState(() => new Set());

  // Tick value used to re-render once the next toast expires. We track
  // the soonest `expiresAt` and schedule a setTimeout for that exact
  // delay; cheaper than polling Date.now() on every render.
  const [, setNowTick] = useState(0);

  // Compose the banner stack. Reachability-derived banners are merged
  // with the context's `banners` list and deduped by id so a context
  // banner with the same id (e.g. 'using-offline-requirements') wins —
  // its message text is the canonical one.
  const composedBanners = useMemo(() => {
    const list = [];
    const seen = new Set();

    const push = (banner) => {
      if (!banner || typeof banner.id !== 'string' || banner.id.length === 0) {
        return;
      }
      if (seen.has(banner.id)) return;
      seen.add(banner.id);
      list.push(banner);
    };

    // Reachability-derived banners first so they're always at the top.
    if (isFirestoreReachable === 'unreachable') {
      push({
        id: 'firestore-unreachable',
        kind: 'warning',
        message: 'Working offline',
      });
    }

    // Then everything from context.
    if (Array.isArray(banners)) {
      for (const banner of banners) push(banner);
    }
    return list;
  }, [banners, isFirestoreReachable]);

  const visibleBanners = useMemo(
    () => composedBanners.filter(
      (b) => !dismissedIds.has(b.id) && b.id !== 'using-offline-requirements',
    ),
    [composedBanners, dismissedIds],
  );

  // Drop dismissed ids that are no longer present in the composed list
  // so a future re-emit of the same id will surface again. Without this
  // pruning, dismissedIds would only grow.
  useEffect(() => {
    if (dismissedIds.size === 0) return;
    const liveIds = new Set(composedBanners.map((b) => b.id));
    let changed = false;
    const next = new Set();
    for (const id of dismissedIds) {
      if (liveIds.has(id)) {
        next.add(id);
      } else {
        changed = true;
      }
    }
    if (changed) setDismissedIds(next);
  }, [composedBanners, dismissedIds]);

  // Filter toasts to those still live. Sort defensively so the soonest
  // expiry is first, which keeps the timer scheduling logic simple.
  const liveToasts = useMemo(() => {
    if (!Array.isArray(toasts) || toasts.length === 0) return [];
    const now = Date.now();
    return toasts
      .filter(
        (t) =>
          t &&
          typeof t.id === 'string' &&
          t.id.length > 0 &&
          typeof t.expiresAt === 'number' &&
          t.expiresAt > now,
      )
      .sort((a, b) => a.expiresAt - b.expiresAt);
  }, [toasts]);

  // Schedule a re-render exactly when the next toast expires. The
  // context already strips its own toasts via setTimeout (see
  // `saveAssessment`), but a defensive timer here ensures the banner
  // stack visually disappears even if a toast lingers in state past its
  // expiry.
  useEffect(() => {
    if (liveToasts.length === 0) return undefined;
    const earliest = liveToasts[0].expiresAt;
    const delay = Math.max(0, earliest - Date.now());
    const timer = setTimeout(() => setNowTick((n) => n + 1), delay + 16);
    return () => clearTimeout(timer);
  }, [liveToasts]);

  const handleDismiss = (bannerId) => {
    setDismissedIds((prev) => {
      if (prev.has(bannerId)) return prev;
      const next = new Set(prev);
      next.add(bannerId);
      return next;
    });
  };

  if (visibleBanners.length === 0 && liveToasts.length === 0) {
    return null;
  }

  return (
    <div className="offline-banner-stack" role="status" aria-live="polite">
      {visibleBanners.map((banner) => {
        const kind =
          banner.kind === 'error' || banner.kind === 'warning' || banner.kind === 'info'
            ? banner.kind
            : 'info';
        return (
          <div
            key={`banner:${banner.id}`}
            className={`offline-banner offline-banner--${kind}`}
            data-banner-id={banner.id}
          >
            <span className="offline-banner__message">{banner.message}</span>
            <button
              type="button"
              className="offline-banner__dismiss"
              onClick={() => handleDismiss(banner.id)}
              aria-label={`Dismiss ${banner.message || 'banner'}`}
            >
              ×
            </button>
          </div>
        );
      })}

      {liveToasts.map((toast) => (
        <div
          key={`toast:${toast.id}`}
          className="offline-banner offline-banner--success"
          data-toast-id={toast.id}
          role="status"
        >
          <span className="offline-banner__message">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

export default OfflineBanner;
