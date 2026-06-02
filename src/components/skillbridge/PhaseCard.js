import React from 'react';
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
 * "Complete" indicator (✓) when `phase.completedAt` is a non-empty string
 * (Req 9.2, 9.9). Clicking the header toggles expansion via
 * `togglePhaseExpansion(phase.id)` (Req 9.3) and reflects state through
 * `aria-expanded` for accessibility.
 *
 * Body (rendered only when expanded): four sections — focus skills,
 * topics, resources (via `<ResourceCard>`), and projects (via
 * `<ProjectCard>` looked up by `projectId` in the curated `projectsCatalog`
 * with a placeholder fallback for AI-generated ids until task 53 wires the
 * AI catalog through). Empty arrays render the placeholder "None"
 * (Req 9.1).
 *
 * Action: "Mark phase complete" button is enabled only when
 * `isPhaseCompletable(phase, portfolio)` is true (Reqs 9.6, 9.7) and the
 * phase is not already completed; on click it calls
 * `markPhaseComplete(phase.id)` (Req 9.8). When already completed, a
 * static "Phase complete" badge is shown instead.
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.6, 9.7, 9.8, 9.9
 */
function PhaseCard({ phase }) {
  const {
    expandedPhaseIds,
    togglePhaseExpansion,
    markPhaseComplete,
    portfolio,
  } = useSkillBridge();

  if (!phase || typeof phase !== 'object') return null;

  const phaseId = typeof phase.id === 'string' ? phase.id : '';
  const label = typeof phase.label === 'string' ? phase.label : phaseId;
  const weekStart = phase.weekStart;
  const weekEnd = phase.weekEnd;
  const focusSkills = Array.isArray(phase.focusSkills) ? phase.focusSkills : [];
  const topics = Array.isArray(phase.topics) ? phase.topics : [];
  const resources = Array.isArray(phase.resources) ? phase.resources : [];
  const projectIds = Array.isArray(phase.projectIds) ? phase.projectIds : [];

  const isCompleted =
    typeof phase.completedAt === 'string' && phase.completedAt.length > 0;

  const expandedList = Array.isArray(expandedPhaseIds) ? expandedPhaseIds : [];
  const isExpanded = expandedList.includes(phaseId);

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
          <PhaseSection
            heading="Focus skills"
            items={focusSkills}
            renderItem={(skillId) => (
              <li key={skillId} className="phase-card__list-item">
                {skillId}
              </li>
            )}
          />

          <PhaseSection
            heading="Topics"
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

          <PhaseSection
            heading="Resources"
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

          <PhaseSection
            heading="Projects"
            items={projectIds}
            renderItem={(projectId) => {
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
            }}
          />

          <div className="phase-card__actions">
            {isCompleted ? (
              <span
                className="phase-card__complete-badge"
                role="status"
                aria-label="Phase complete"
              >
                Phase complete
              </span>
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
 * Internal helper that renders a labeled section with either a
 * `<ul>` of items or the placeholder "None" when the array is empty
 * (Req 9.1).
 */
function PhaseSection({ heading, items, renderItem }) {
  const list = Array.isArray(items) ? items : [];
  return (
    <section className="phase-card__section">
      <h4 className="phase-card__section-heading">{heading}</h4>
      {list.length === 0 ? (
        <p className="phase-card__none">None</p>
      ) : (
        <ul className="phase-card__list">
          {list.map((item, idx) => renderItem(item, idx))}
        </ul>
      )}
    </section>
  );
}

export default PhaseCard;
