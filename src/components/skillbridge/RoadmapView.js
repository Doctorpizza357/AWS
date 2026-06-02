import React from 'react';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import careers from '../../data/careers';
import PhaseCard from './PhaseCard';
import './RoadmapView.css';

/**
 * RoadmapView
 *
 * Renders the user's active `currentRoadmap` (Req 9.1) — a header summary
 * plus one `<PhaseCard>` per phase. The header surfaces the roadmap
 * provenance (`AI` / `Cache` / `Curated fallback`) so the user can tell at
 * a glance whether they are looking at a fresh AI-generated plan or one
 * served from cache (Req 8.6) — and the roadmap completion percentage
 * derived from `roadmapCompletionPct` in `SkillBridgeContext`.
 *
 * Generation controls:
 *   - When `currentRoadmap === null`, the empty-state body shows a single
 *     "Generate roadmap" button calling `generateRoadmap()` (Req 8.11
 *     drives the regenerate flow; the first-generation flow is the
 *     default invocation).
 *   - When a roadmap exists, the header exposes a "Regenerate roadmap"
 *     button calling `generateRoadmap({ force: true })`. Req 8.11 requires
 *     a forced fetch — `force: true` makes the action skip the cache
 *     short-circuit even when the profile hash matches.
 *
 * Both buttons defer their own validation (assessment confirmed,
 * `dreamJobId` valid) to the context action, which surfaces the
 * documented inline-error banner on failure (Req 8.10).
 *
 * Validates: Requirements 8.6, 8.11, 9.1
 */

/**
 * Map the internal `roadmapSource` enum to a user-facing label.
 *
 *   - `'ai'`              → `'AI'`
 *   - `'cache'`           → `'Cache'`
 *   - `'fallback-curated'`→ `'Curated fallback'`
 *   - anything else       → `'—'` (em-dash placeholder)
 */
function sourceLabel(roadmapSource) {
  switch (roadmapSource) {
    case 'ai':
      return 'AI';
    case 'cache':
      return 'Cache';
    case 'fallback-curated':
      return 'Curated fallback';
    default:
      return '\u2014';
  }
}

/**
 * Title-case a kebab-cased identifier as a fallback for when no
 * `careers.js` entry can be found for the current `dreamJobId` (e.g.
 * stale Firestore data from a removed career or a `fallback-{careerId}`
 * id surviving from an older roadmap shape). Splits on hyphens and
 * underscores, capitalizes each word, and drops a leading "Fallback "
 * so the user never sees the internal-source prefix.
 *
 *   "fallback-software-engineer" → "Software Engineer"
 *   "data_scientist"             → "Data Scientist"
 *
 * @param {string} value
 * @returns {string}
 */
function titleCaseId(value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  const words = value
    .split(/[-_\s]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  // The curated fallback prefixes the id with "fallback-" — strip that
  // here so the visible title is always the career name.
  if (words.length > 1 && words[0] === 'Fallback') words.shift();
  return words.join(' ');
}

/**
 * Resolve the user-facing roadmap title for a given `dreamJobId` and
 * `roadmap` shape:
 *
 *   1. Prefer `careers.js[dreamJobId].title` so the title matches the
 *      copy on the dream-job picker exactly (Req 1.1) — works for
 *      every AI, cache, and curated-fallback roadmap.
 *   2. Fall back to a Title-Cased projection of `dreamJobId` itself
 *      when the careers lookup misses.
 *   3. Fall back to a Title-Cased projection of `roadmap.id` when even
 *      `dreamJobId` is missing (extreme edge case — a roadmap with no
 *      attached career, e.g. a corrupted Firestore document).
 *   4. Final fallback: the literal string "Roadmap" so the header
 *      always renders something.
 *
 * Returns the title without the trailing " Roadmap" suffix; the caller
 * appends that so screen readers don't repeat the word twice when the
 * eyebrow already reads "Roadmap".
 */
function resolveRoadmapTitle(dreamJobId, roadmap) {
  const career =
    typeof dreamJobId === 'string' && dreamJobId.length > 0
      ? careers.find((c) => c && c.id === dreamJobId)
      : null;
  if (career && typeof career.title === 'string' && career.title.length > 0) {
    return career.title;
  }
  const dreamJobTitle = titleCaseId(dreamJobId);
  if (dreamJobTitle.length > 0) return dreamJobTitle;
  const idTitle = titleCaseId(roadmap && roadmap.id);
  if (idTitle.length > 0) return idTitle;
  return '';
}

function RoadmapView() {
  const {
    currentRoadmap,
    roadmapSource,
    roadmapCompletionPct,
    dreamJobId,
    generateRoadmap,
  } = useSkillBridge();

  const handleGenerate = () => {
    // First-time generation — no `force` flag (Req 8.1 path; the cache
    // short-circuit is already a no-op when no roadmap exists).
    if (typeof generateRoadmap === 'function') {
      generateRoadmap();
    }
  };

  const handleRegenerate = () => {
    // Manual regenerate — Req 8.11 mandates a forced fetch that bypasses
    // the cache short-circuit so the user always gets a fresh plan.
    if (typeof generateRoadmap === 'function') {
      generateRoadmap({ force: true });
    }
  };

  // Empty state: no roadmap yet. Render the documented CTA + a single
  // "Generate roadmap" button.
  if (currentRoadmap === null || currentRoadmap === undefined) {
    return (
      <section
        className="roadmap-view roadmap-view--empty"
        aria-label="Roadmap"
      >
        <div className="roadmap-view__empty-body">
          <h3 className="roadmap-view__empty-title">No roadmap yet</h3>
          <p className="roadmap-view__empty-message">
            Generate a personalized phased weekly plan for your dream job.
          </p>
          <button
            type="button"
            className="roadmap-view__generate-button"
            onClick={handleGenerate}
          >
            Generate roadmap
          </button>
        </div>
      </section>
    );
  }

  const phases = Array.isArray(currentRoadmap.phases)
    ? currentRoadmap.phases
    : [];
  const completionPct = Number.isFinite(roadmapCompletionPct)
    ? roadmapCompletionPct
    : 0;

  // Resolve the visible title from the user's dream job rather than the
  // internal `roadmap.id` (which is a cache key like `fallback-software-
  // engineer` or `roadmap-1`). Always append " Roadmap" so the AI,
  // cache, and curated-fallback paths read identically.
  const careerTitle = resolveRoadmapTitle(dreamJobId, currentRoadmap);
  const displayTitle = careerTitle ? `${careerTitle} Roadmap` : 'Roadmap';

  return (
    <section className="roadmap-view" aria-label="Roadmap">
      <header className="roadmap-view__header">
        <div className="roadmap-view__header-main">
          <span className="roadmap-view__eyebrow">Roadmap</span>
          <h3 className="roadmap-view__id" title={displayTitle}>
            {displayTitle}
          </h3>
        </div>

        <dl className="roadmap-view__meta">
          <div className="roadmap-view__meta-item">
            <dt className="roadmap-view__meta-label">Source</dt>
            <dd className="roadmap-view__meta-value">
              {sourceLabel(roadmapSource)}
            </dd>
          </div>
          <div className="roadmap-view__meta-item">
            <dt className="roadmap-view__meta-label">Completion</dt>
            <dd className="roadmap-view__meta-value">{completionPct}%</dd>
          </div>
        </dl>

        <div className="roadmap-view__actions">
          <button
            type="button"
            className="roadmap-view__regenerate-button"
            onClick={handleRegenerate}
          >
            Regenerate roadmap
          </button>
        </div>
      </header>

      {phases.length === 0 ? (
        <p className="roadmap-view__no-phases">
          This roadmap has no phases yet.
        </p>
      ) : (
        <ol className="roadmap-view__phases">
          {phases.map((phase, idx) => {
            const key =
              phase && typeof phase.id === 'string' && phase.id.length > 0
                ? phase.id
                : `phase-${idx}`;
            return (
              <li key={key} className="roadmap-view__phase">
                <PhaseCard phase={phase} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default RoadmapView;
