import React from 'react';
import './ResourceCard.css';

/**
 * ResourceCard
 *
 * Renders a learning resource as a non-interactive card showing only
 * `title`, `provider`, and `topic`. Per Req 9.4 the wrapping element is a
 * plain <div> (not <a>, not <button>), exposes no click or key handler,
 * and uses `tabIndex={-1}` plus `aria-disabled="true"` so it is not
 * focusable and does not navigate. Per Req 9.5, no URL field is rendered
 * even if one is present on the resource object.
 */
function ResourceCard({ resource }) {
  if (!resource) {
    return null;
  }

  const { title, provider, topic } = resource;

  return (
    <div
      className="resource-card"
      tabIndex={-1}
      aria-disabled="true"
      role="group"
      aria-label="Learning resource"
    >
      <div className="resource-card-field">
        <span className="resource-card-label">Title</span>
        <span className="resource-card-value resource-card-title">{title}</span>
      </div>
      <div className="resource-card-field">
        <span className="resource-card-label">Provider</span>
        <span className="resource-card-value resource-card-provider">{provider}</span>
      </div>
      <div className="resource-card-field">
        <span className="resource-card-label">Topic</span>
        <span className="resource-card-value resource-card-topic">{topic}</span>
      </div>
    </div>
  );
}

export default ResourceCard;
