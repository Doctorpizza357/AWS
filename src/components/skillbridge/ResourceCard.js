import React from 'react';
import './ResourceCard.css';

/**
 * Build a Google-search Resource_Search_URL from a resource's title/provider.
 * Returns null when no valid URL can be produced (empty/whitespace/missing
 * title, or an encoding failure).
 *
 * @param {{ title?: unknown, provider?: unknown }} resource
 * @returns {string|null}  e.g. "https://www.google.com/search?q=Clean%20Code%20Pearson"
 */
export function buildResourceSearchUrl(resource) {
  if (!resource || typeof resource !== 'object') return null;

  const title = typeof resource.title === 'string' ? resource.title.trim() : '';
  if (title.length === 0) return null; // Req 6.5 / 7.2 / 9.4

  const provider =
    typeof resource.provider === 'string' ? resource.provider.trim() : '';

  const query = provider.length > 0 ? `${title} ${provider}` : title; // Req 6.2 / 6.3

  try {
    const encoded = encodeURIComponent(query); // Req 6.4
    return `https://www.google.com/search?q=${encoded}`; // Req 6.1
  } catch (err) {
    return null; // Req 6.6 — encoding failed, render without a link
  }
}

/**
 * ResourceCard
 *
 * Renders a learning resource showing `title`, `provider`, and `topic`. When a
 * Resource_Search_URL can be derived from the resource's `title`/`provider`
 * (via {@link buildResourceSearchUrl}), the title is rendered as a secure
 * `<a target="_blank" rel="noopener noreferrer">` link (Req 7.1, 7.3, 8.1,
 * 8.2). When no valid URL can be built (empty/whitespace/missing title or an
 * encoding failure), the title is rendered as plain non-interactive text with
 * no anchor (Req 7.2, 9.4). The href is always derived from `title`/`provider`
 * and never read from any `url`/`link` field on the resource (Req 9.2). All
 * three text fields are rendered regardless of whether the link is present
 * (Req 9.3).
 */
function ResourceCard({ resource }) {
  if (!resource) {
    return null;
  }

  const { title, provider, topic } = resource;
  const url = buildResourceSearchUrl(resource);

  return (
    <div className="resource-card" role="group" aria-label="Learning resource">
      <div className="resource-card-field">
        <span className="resource-card-label">Title</span>
        {typeof url === 'string' && url.length > 0 ? (
          <a
            className="resource-card-value resource-card-title resource-card-title-link"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {title}
          </a>
        ) : (
          <span className="resource-card-value resource-card-title">{title}</span>
        )}
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
