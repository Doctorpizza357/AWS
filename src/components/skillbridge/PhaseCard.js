import React, { useEffect, useId, useState } from 'react';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import { isPhaseCompletable } from '../../services/skillbridgeService';
import projectsCatalog from '../../data/projects';
import ResourceCard from './ResourceCard';
import ProjectCard from './ProjectCard';
import './PhaseCard.css';

/**
 * PhaseCard
 *
 * Collapsible card representing a single Phase of the current Roadmap.
 *
 * Header: shows `phase.label`, `Weeks {weekStart}–{weekEnd}`, and a
 * "Complete" indicator (✓) when `phase.completedAt` is a non-empty string.
 * Clicking the header toggles expansion via `togglePhaseExpansion(phase.id)`
 * and reflects state through `aria-expanded` for accessibility.
 *
 * Body (rendered only when the phase is expanded): the Focus skills, Topics,
 * and Resources sections are now three INDEPENDENT collapsible dropdowns
 * (`PhaseSectionDropdown`) — each collapsed by default, each with an item
 * count in its header (e.g. `Focus skills (4)`), each toggled by a native
 * `<button>` following the existing phase-header toggle pattern
 * (`aria-expanded` + `aria-controls`, native Enter/Space, `:focus-visible`
 * ring, chevron indicator). The Projects section is left unchanged: it renders
 * via the always-visible inline list path (heading + `<ul>`/`None`), with no
 * toggle button and no collapsible panel (Req 1.7).
 *
 * Section dropdown open/closed state is purely presentational and lives in
 * local `useState` (`openSections`). It is reset to all-collapsed whenever the
 * phase leaves the expanded state, so each time the phase re-enters the
 * expanded state every dropdown renders collapsed (Req 2.1). Toggling one
 * section inverts only that section's key, leaving the others untouched
 * (Req 1.6, 1.8).
 *
 * Action: while the phase is not complete, a "Mark phase complete" button is
 * shown, enabled only when `isPhaseCompletable(phase, portfolio)` is true and
 * on click it calls `markPhaseComplete(phase.id)`. While the phase IS complete,
 * a keyboard-focusable "Unmark" control is shown in place of that button;
 * activating it invokes `unmarkPhaseComplete(phase.id)` exactly once with no
 * confirmation prompt. The action region sits OUTSIDE all section dropdowns so
 * it stays reachable regardless of dropdown state.
 *
 * Read-only preview: the dropdown toggles are native form-associated
 * `<button>`s, so a `<fieldset disabled>` ancestor disables them transitively
 * and section state does not change on activation (Req 10.1, 10.2).
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2,
 *   3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8,
 *   5.9, 5.10, 10.1, 10.2
 */
function PhaseCard({ phase }) {
  const {
    expandedPhaseIds,
    togglePhaseExpansion,
    markPhaseComplete,
    unmarkPhaseComplete,
    portfolio,
  } = useSkillBridge();

  // Local, ephemeral, presentational open/closed state for the three
  // collapsible sections. Not persisted, not shared (see design.md).
  const [openSections, setOpenSections] = useState({
    focusSkills: false,
    topics: false,
    resources: false,
  });

  // Fallback id base so panel ids / `aria-controls` stay unique even when a
  // phase has no id. `useId` is stable per component instance; strip the
  // colons React emits so the id is a clean, querySelector-safe token.
  const reactId = useId();

  const phaseId = typeof (phase && phase.id) === 'string' ? phase.id : '';

  const expandedList = Array.isArray(expandedPhaseIds) ? expandedPhaseIds : [];
  const isExpanded = expandedList.includes(phaseId);

  // Reset section dropdowns to all-collapsed whenever the phase is not
  // expanded, so re-entering the expanded state always starts collapsed
  // (Req 2.1). State only changes otherwise via direct toggle activation
  // (Req 1.8).
  useEffect(() => {
    if (!isExpanded) {
      setOpenSections({ focusSkills: false, topics: false, resources: false });
    }
  }, [isExpanded]);

  if (!phase || typeof phase !== 'object') return null;

  const label = typeof phase.label === 'string' ? phase.label : phaseId;
  const weekStart = phase.weekStart;
  const weekEnd = phase.weekEnd;
  const focusSkills = Array.isArray(phase.focusSkills) ? phase.focusSkills : [];
  const topics = Array.isArray(phase.topics) ? phase.topics : [];
  const resources = Array.isArray(phase.resources) ? phase.resources : [];
  const projectIds = Array.isArray(phase.projectIds) ? phase.projectIds : [];

  const isCompleted =
    typeof phase.completedAt === 'string' && phase.completedAt.length > 0;

  const portfolioList = Array.isArray(portfolio) ? portfolio : [];
  const completable = isPhaseCompletable(phase, portfolioList);

  const handleHeaderToggle = () => {
    if (phaseId) togglePhaseExpansion(phaseId);
  };

  const handleHeaderKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleHeaderToggle();
    }
  };

  const handleMarkComplete = async () => {
    if (!phaseId) return;
    await markPhaseComplete(phaseId);
  };

  const handleUnmark = async () => {
    if (!phaseId) return;
    await unmarkPhaseComplete(phaseId);
  };

  const toggleSection = (key) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // Namespace panel ids by phase id (or the stable fallback) + section key so
  // `aria-controls` is unique across multiple phases on the page (Req 5.6).
  const idBase = phaseId || reactId.replace(/:/g, '');
  const panelId = (key) => `phase-card-section-${idBase}-${key}`;

  const bodyId = phaseId ? `phase-card-body-${phaseId}` : undefined;
  const headerLabel =
    typeof weekStart === 'number' && typeof weekEnd === 'number'
      ? `Weeks ${weekStart}\u2013${weekEnd}`
      : null;

  return (
    <article
      className={`phase-card${isCompleted ? ' phase-card--complete' : ''}`}
    >
      <button
        type="button"
        className="phase-card__header"
        onClick={handleHeaderToggle}
        onKeyDown={handleHeaderKeyDown}
        aria-expanded={isExpanded}
        aria-controls={bodyId}
      >
        <span className="phase-card__header-main">
          <span className="phase-card__label">{label}</span>
          {headerLabel ? (
            <span className="phase-card__weeks">{headerLabel}</span>
          ) : null}
        </span>
        <span className="phase-card__header-meta">
          {isCompleted ? (
            <span
              className="phase-card__complete-indicator"
              aria-label="Phase complete"
              title="Phase complete"
            >
              {'\u2713'}
            </span>
          ) : null}
          <span
            className="phase-card__chevron"
            aria-hidden="true"
          >
            {isExpanded ? '\u25BE' : '\u25B8'}
          </span>
        </span>
      </button>

      {isExpanded ? (
        <div
          id={bodyId}
          className="phase-card__body"
        >
          <PhaseSectionDropdown
            heading="Focus skills"
            count={focusSkills.length}
            isOpen={openSections.focusSkills}
            onToggle={() => toggleSection('focusSkills')}
            panelId={panelId('focusSkills')}
            items={focusSkills}
            renderItem={(skillId) => (
              <li key={skillId} className="phase-card__list-item">
                {skillId}
              </li>
            )}
          />

          <PhaseSectionDropdown
            heading="Topics"
            count={topics.length}
            isOpen={openSections.topics}
            onToggle={() => toggleSection('topics')}
            panelId={panelId('topics')}
            items={topics}
            renderItem={(topic, idx) => (
              <li
                key={`${topic}-${idx}`}
                className="phase-card__list-item"
              >
                {topic}
              </li>
            )}
          />

          <PhaseSectionDropdown
            heading="Resources"
            count={resources.length}
            isOpen={openSections.resources}
            onToggle={() => toggleSection('resources')}
            panelId={panelId('resources')}
            items={resources}
            renderItem={(resource, idx) => (
              <li
                key={`${resource && resource.title ? resource.title : 'resource'}-${idx}`}
                className="phase-card__resource-item"
              >
                <ResourceCard resource={resource} />
              </li>
            )}
          />

          {/* Projects: always-visible inline list path — no toggle, no panel
              (Req 1.7). */}
          <section className="phase-card__section">
            <h4 className="phase-card__section-heading">Projects</h4>
            {projectIds.length === 0 ? (
              <p className="phase-card__none">None</p>
            ) : (
              <ul className="phase-card__list">
                {projectIds.map((projectId) => {
                  const catalogProject = projectsCatalog.find(
                    (p) => p && p.id === projectId,
                  );
                  const project = catalogProject || {
                    id: projectId,
                    title: projectId,
                    careerIds: [],
                    skills: [],
                    deliverables: [],
                  };
                  const isProjectCompleted = portfolioList.some(
                    (e) => e && e.projectId === projectId,
                  );
                  return (
                    <li key={projectId} className="phase-card__project-item">
                      <ProjectCard
                        project={project}
                        isCompleted={isProjectCompleted}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="phase-card__actions">
            {isCompleted ? (
              <button
                type="button"
                className="phase-card__unmark-button"
                onClick={handleUnmark}
              >
                Unmark
              </button>
            ) : (
              <button
                type="button"
                className="phase-card__complete-button"
                onClick={handleMarkComplete}
                disabled={!completable}
                aria-disabled={!completable}
              >
                Mark phase complete
              </button>
            )}
          </div>
        </div>
      ) : null}
    </article>
  );
}

/**
 * One independent collapsible section inside an expanded PhaseCard.
 *
 * Owns no state itself — open/closed is lifted to PhaseCard so each of the
 * three sections is tracked independently and toggled in isolation (Req 1.6).
 *
 * The header is a native `<button>` carrying `aria-expanded` and
 * `aria-controls` so Enter/Space activation is handled natively (no custom key
 * handler) and assistive tech can announce the state (Req 5.1–5.7). The label
 * is `${heading} (${count})` where `count = Array.isArray(items) ? items.length
 * : 0` (Req 3.1, 3.2, 3.4). A chevron span mirrors the phase header's ▾/▸
 * indicator via CSS so the button's text label stays exactly `${heading}
 * (${count})` (Req 1.5).
 *
 * The panel mounts at all times (so its `aria-controls` target always exists
 * and `querySelectorAll` still finds its content) but carries the `hidden`
 * attribute when collapsed, which removes its content from layout, the
 * accessibility tree, and Tab order (Req 2.2, 4.3, 5.9). When open it shows the
 * `<ul>` of items, or the "None" placeholder when the array is empty / null /
 * undefined (Req 4.1, 4.2).
 *
 * @param {string}   heading
 * @param {number}   count
 * @param {boolean}  isOpen
 * @param {() => void} onToggle
 * @param {string}   panelId
 * @param {unknown[]} items
 * @param {(item, idx) => React.ReactNode} renderItem
 */
function PhaseSectionDropdown({
  heading,
  count,
  isOpen,
  onToggle,
  panelId,
  items,
  renderItem,
}) {
  const list = Array.isArray(items) ? items : [];
  const safeCount = typeof count === 'number' ? count : list.length;

  return (
    <section className="phase-card__section">
      <button
        type="button"
        className="phase-card__section-toggle"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span
          className={`phase-card__section-chevron${
            isOpen ? ' phase-card__section-chevron--open' : ''
          }`}
          aria-hidden="true"
        />
        <span className="phase-card__section-heading">
          {`${heading} (${safeCount})`}
        </span>
      </button>
      <div
        id={panelId}
        className="phase-card__section-panel"
        hidden={!isOpen}
      >
        {list.length === 0 ? (
          <p className="phase-card__none">None</p>
        ) : (
          <ul className="phase-card__list">
            {list.map((item, idx) => renderItem(item, idx))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default PhaseCard;
