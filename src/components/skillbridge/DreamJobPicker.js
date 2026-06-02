import React, { useState } from 'react';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import careers from '../../data/careers';
import './DreamJobPicker.css';

/**
 * `DreamJobPicker` renders the full `careers.js` catalog as selectable
 * cards (Req 1.1). Selecting a career calls `selectDreamJob` directly
 * (Req 1.2) when no roadmap exists; when a `currentRoadmap` is already
 * present, the swap goes through an inline confirmation dialog before
 * calling `changeDreamJob(..., true)` (Reqs 1.3, 1.4). Inline error
 * banners surfaced by the context (`unknown-career`,
 * `no-skill-requirements`) are rendered above the picker (Req 1.6, 2.8).
 */
function DreamJobPicker() {
  const {
    dreamJobId,
    currentRoadmap,
    selectDreamJob,
    changeDreamJob,
    banners,
  } = useSkillBridge();

  // Career id awaiting confirmation to swap an existing roadmap.
  const [pendingSwapId, setPendingSwapId] = useState(null);

  const bannerList = Array.isArray(banners) ? banners : [];
  const relevantBanners = bannerList.filter(
    (b) =>
      b &&
      (b.id === 'unknown-career' || b.id === 'no-skill-requirements'),
  );

  const handleSelect = (careerId) => {
    // No-op when the user re-clicks the already-selected card. Avoids a
    // confirmation prompt for a swap that would be a no-op.
    if (careerId === dreamJobId) return;

    if (currentRoadmap) {
      // Block on confirmation — do not call changeDreamJob until the
      // user confirms the archive in the inline dialog (Req 1.3).
      setPendingSwapId(careerId);
      return;
    }
    // No roadmap to archive — proceed directly (Req 1.5 → Req 1.2).
    selectDreamJob(careerId);
  };

  const handleConfirmSwap = () => {
    const target = pendingSwapId;
    setPendingSwapId(null);
    if (target) {
      changeDreamJob(target, true);
    }
  };

  const handleCancelSwap = () => {
    setPendingSwapId(null);
  };

  const pendingCareer = pendingSwapId
    ? careers.find((c) => c.id === pendingSwapId)
    : null;

  return (
    <div className="dream-job-picker">
      <header className="dream-job-picker__header">
        <h2 className="dream-job-picker__title">Pick your dream job</h2>
        <p className="dream-job-picker__subtitle">
          Choose a career to anchor your skill gap analysis and roadmap.
        </p>
      </header>

      {relevantBanners.length > 0 && (
        <div className="dream-job-picker__banners" role="status">
          {relevantBanners.map((b) => (
            <div
              key={b.id}
              className={`dream-job-picker__banner dream-job-picker__banner--${b.kind || 'info'}`}
            >
              {b.message}
            </div>
          ))}
        </div>
      )}

      <ul className="dream-job-picker__list">
        {careers.map((career) => {
          const selected = career.id === dreamJobId;
          return (
            <li key={career.id} className="dream-job-picker__item">
              <button
                type="button"
                className={`dream-job-picker__card${selected ? ' dream-job-picker__card--selected' : ''}`}
                style={{ '--card-color': career.color }}
                onClick={() => handleSelect(career.id)}
                aria-pressed={selected}
                aria-label={`Select ${career.title} as your dream job`}
              >
                <span className="dream-job-picker__card-title">
                  {career.title}
                </span>
                <span className="dream-job-picker__card-field">
                  {career.field}
                </span>
                <span className="dream-job-picker__card-description">
                  {career.description}
                </span>
                {selected && (
                  <span className="dream-job-picker__card-selected-tag">
                    Selected
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {pendingCareer && (
        <div
          className="dream-job-picker__confirm"
          role="dialog"
          aria-modal="false"
          aria-labelledby="dream-job-picker-confirm-title"
        >
          <h3
            id="dream-job-picker-confirm-title"
            className="dream-job-picker__confirm-title"
          >
            Switch to {pendingCareer.title}?
          </h3>
          <p className="dream-job-picker__confirm-message">
            This will archive your current roadmap. Continue?
          </p>
          <div className="dream-job-picker__confirm-actions">
            <button
              type="button"
              className="dream-job-picker__confirm-btn dream-job-picker__confirm-btn--primary"
              onClick={handleConfirmSwap}
            >
              Confirm
            </button>
            <button
              type="button"
              className="dream-job-picker__confirm-btn"
              onClick={handleCancelSwap}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DreamJobPicker;
