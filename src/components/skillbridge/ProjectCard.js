import React, { useState } from 'react';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import CompletionForm from './CompletionForm';
import './ProjectCard.css';

/**
 * ProjectCard
 *
 * Renders a single Project's metadata (`title`, `summary`, `difficulty`,
 * `estHours`, `deliverables`, and the `aiGenerated` indicator when truthy)
 * and hosts an inline `<CompletionForm>` toggleable via the "Mark
 * complete" button. When the project is already completed the card swaps
 * the action affordance for a "Completed ✓" badge plus an "Unmark" button
 * that calls `unmarkProjectComplete(project.id)` from `SkillBridgeContext`
 * (Req 11.10).
 *
 * Completion lookup falls back to `useSkillBridge().portfolio` when no
 * `isCompleted` prop is supplied, so the card can be rendered standalone
 * inside list iterators that don't pre-derive the flag.
 *
 * Validates: Requirements 9.1, 10.1, 11.1, 11.10
 */
function ProjectCard({ project, isCompleted }) {
  const { portfolio, unmarkProjectComplete } = useSkillBridge();
  const [isFormOpen, setIsFormOpen] = useState(false);

  if (!project || typeof project !== 'object') {
    return null;
  }

  const {
    id,
    title,
    summary,
    difficulty,
    estHours,
    deliverables,
    aiGenerated,
  } = project;

  // When the consumer didn't tell us, derive from the portfolio.
  const completed =
    typeof isCompleted === 'boolean'
      ? isCompleted
      : Array.isArray(portfolio) &&
        portfolio.some(
          (entry) => entry && entry.projectId === id,
        );

  const difficultyClass =
    difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard'
      ? `project-card__badge--${difficulty}`
      : '';

  const deliverableList = Array.isArray(deliverables) ? deliverables : [];

  const handleMarkClick = () => {
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
  };

  const handleUnmark = () => {
    if (typeof unmarkProjectComplete === 'function') {
      unmarkProjectComplete(id);
    }
  };

  return (
    <article
      className={
        'project-card' + (completed ? ' project-card--completed' : '')
      }
      aria-label={typeof title === 'string' ? title : 'Project'}
    >
      <header className="project-card__header">
        <h3 className="project-card__title">{title || id}</h3>
        <div className="project-card__badges">
          {difficulty ? (
            <span
              className={`project-card__badge ${difficultyClass}`.trim()}
              aria-label={`Difficulty ${difficulty}`}
            >
              {difficulty}
            </span>
          ) : null}
          {aiGenerated ? (
            <span
              className="project-card__badge project-card__badge--ai"
              aria-label="AI generated"
            >
              AI
            </span>
          ) : null}
          {completed ? (
            <span
              className="project-card__badge project-card__badge--completed"
              aria-label="Completed"
            >
              Completed ✓
            </span>
          ) : null}
        </div>
      </header>

      {summary ? (
        <p className="project-card__summary">{summary}</p>
      ) : null}

      <div className="project-card__meta">
        {typeof estHours === 'number' ? (
          <span>
            <span className="project-card__meta-label">Est. hours:</span>
            {estHours}
          </span>
        ) : null}
      </div>

      {deliverableList.length > 0 ? (
        <div className="project-card__deliverables-section">
          <p className="project-card__deliverables-title">Deliverables</p>
          <ul className="project-card__deliverables">
            {deliverableList.map((item, idx) => (
              <li key={`${id}-deliverable-${idx}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="project-card__actions">
        {completed ? (
          <button
            type="button"
            className="project-card__action project-card__action--secondary"
            onClick={handleUnmark}
          >
            Unmark
          </button>
        ) : isFormOpen ? null : (
          <button
            type="button"
            className="project-card__action project-card__action--primary"
            onClick={handleMarkClick}
          >
            Mark complete
          </button>
        )}
      </div>

      {isFormOpen && !completed ? (
        <CompletionForm projectId={id} onSuccess={handleFormSuccess} />
      ) : null}
    </article>
  );
}

export default ProjectCard;
