import React, { useEffect, useRef, useState } from 'react';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import './CompletionForm.css';

const URL_MAX = 2048;
const NOTES_MAX = 2000;

const URL_ERROR = 'Enter a valid http or https URL';
const NOTES_ERROR = 'Notes must be 2000 characters or fewer';
const ALREADY_COMPLETE_ERROR = 'Project already completed';
const NOT_IN_ROADMAP_ERROR = 'This project is not part of your current roadmap';

/**
 * CompletionForm
 *
 * Inline form rendered inside a `<ProjectCard>` to capture optional
 * evidence (URL + notes) for a completed project. Submits via
 * `markProjectComplete(projectId, evidence)` from `SkillBridgeContext`.
 *
 * Local validation runs before the action call:
 *   - When `url` is non-empty AND does not start with `http://` or
 *     `https://` → surface `"Enter a valid http or https URL"` (Req 11.8).
 *   - When `url.length > 2048` → same error (Req 11.2).
 *   - When `notes.length > 2000` → "Notes must be 2000 characters or
 *     fewer" (Req 11.2).
 *
 * After the action settles, the form snapshots the banner ids that were
 * present before the submit and looks for newly-appended ids. The
 * `appendBannerOnce` dedup in the provider means stale banners from a
 * previous submit would otherwise fire a false-positive on retry, so we
 * only react to ids that appeared *during* this submission. The known
 * failure ids surfaced inline are:
 *   - `'project-not-in-roadmap'` → "This project is not part of your
 *     current roadmap" (Req 21.3).
 *   - `'project-already-completed'` → "Project already completed"
 *     (Req 11.9).
 *   - `'completion-form-invalid'` → "Enter a valid http or https URL"
 *     (Req 11.8).
 *
 * Otherwise `onSuccess()` is invoked so the parent `<ProjectCard>` can
 * collapse the form.
 *
 * Validates: Requirements 11.1, 11.2, 11.3, 11.8, 11.9, 21.3
 */
function CompletionForm({ projectId, onSuccess }) {
  const { markProjectComplete, banners } = useSkillBridge();
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Mirror the latest `banners` from context in a ref so the post-submit
  // check inside `handleSubmit` reads the freshest value rather than the
  // stale closure captured at submit time.
  const bannersRef = useRef(banners);
  useEffect(() => {
    bannersRef.current = banners;
  }, [banners]);

  const handleUrlChange = (event) => {
    setUrl(event.target.value);
    if (error) setError('');
  };

  const handleNotesChange = (event) => {
    setNotes(event.target.value);
    if (error) setError('');
  };

  const handleSubmit = async (event) => {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    // Local URL validation (Reqs 11.2, 11.8). Empty url is permitted.
    if (url.length > 0) {
      if (
        url.length > URL_MAX ||
        (!url.startsWith('http://') && !url.startsWith('https://'))
      ) {
        setError(URL_ERROR);
        return;
      }
    }

    // Local notes length validation (Req 11.2).
    if (notes.length > NOTES_MAX) {
      setError(NOTES_ERROR);
      return;
    }

    // Snapshot banner ids before submit so we can detect *new* ones the
    // action appends. `appendBannerOnce` in the provider would otherwise
    // hide a real failure on retry because the stale banner from a
    // previous submit is already present.
    const beforeList = Array.isArray(bannersRef.current)
      ? bannersRef.current
      : [];
    const beforeIds = new Set(
      beforeList.filter((b) => b && typeof b.id === 'string').map((b) => b.id),
    );

    setSubmitting(true);
    try {
      await markProjectComplete(projectId, { url, notes });
    } finally {
      setSubmitting(false);
    }

    // Yield once so any pending React renders + effects from the action's
    // setState calls flush and `bannersRef.current` reflects the latest
    // value. `markProjectComplete` is async with internal awaits, so in
    // most paths a render has already committed; the extra microtask is
    // a defensive belt-and-suspenders.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const afterList = Array.isArray(bannersRef.current)
      ? bannersRef.current
      : [];
    const newOnes = afterList.filter(
      (b) => b && typeof b.id === 'string' && !beforeIds.has(b.id),
    );

    if (newOnes.some((b) => b.id === 'project-not-in-roadmap')) {
      setError(NOT_IN_ROADMAP_ERROR);
      return;
    }
    if (newOnes.some((b) => b.id === 'project-already-completed')) {
      setError(ALREADY_COMPLETE_ERROR);
      return;
    }
    if (newOnes.some((b) => b.id === 'completion-form-invalid')) {
      setError(URL_ERROR);
      return;
    }

    if (typeof onSuccess === 'function') {
      onSuccess();
    }
  };

  const inputId = `completion-form-url-${projectId}`;
  const notesId = `completion-form-notes-${projectId}`;

  return (
    <form
      className="completion-form"
      onSubmit={handleSubmit}
      aria-label="Project completion form"
    >
      <div className="completion-form__field">
        <label htmlFor={inputId} className="completion-form__label">
          Project URL (optional)
        </label>
        <input
          id={inputId}
          type="url"
          className="completion-form__input"
          placeholder="https://your-project-url.com"
          maxLength={URL_MAX}
          value={url}
          onChange={handleUrlChange}
          disabled={submitting}
        />
      </div>

      <div className="completion-form__field">
        <label htmlFor={notesId} className="completion-form__label">
          Notes (optional)
        </label>
        <textarea
          id={notesId}
          className="completion-form__textarea"
          maxLength={NOTES_MAX}
          value={notes}
          onChange={handleNotesChange}
          disabled={submitting}
        />
        <span className="completion-form__counter" aria-live="polite">
          {notes.length} / {NOTES_MAX}
        </span>
      </div>

      {error ? (
        <div
          className="completion-form__error"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      ) : null}

      <div className="completion-form__actions">
        <button
          type="button"
          className="completion-form__cancel"
          onClick={() => {
            if (typeof onSuccess === 'function') onSuccess();
          }}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="completion-form__submit"
          disabled={submitting}
        >
          {submitting ? 'Saving…' : 'Submit'}
        </button>
      </div>
    </form>
  );
}

export default CompletionForm;
