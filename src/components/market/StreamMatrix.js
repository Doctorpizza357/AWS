import React, { useState, useEffect } from 'react';
import { useMarketIntelligence } from '../../context/MarketIntelligenceContext';
import './StreamMatrix.css';

function StreamMatrix({ data, loading, compact }) {
  const { refreshJobs } = useMarketIntelligence();
  const [filter, setFilter] = useState('all');
  const [animatingIds, setAnimatingIds] = useState(new Set());

  // Animate new items
  useEffect(() => {
    if (data?.length > 0) {
      const ids = new Set(data.map(d => d.id));
      setAnimatingIds(ids);
      const timer = setTimeout(() => setAnimatingIds(new Set()), 600);
      return () => clearTimeout(timer);
    }
  }, [data]);

  if (loading) {
    return (
      <div className={`stream-container ${compact ? 'compact' : ''}`}>
        {[1, 2, 3].map(i => (
          <div key={i} className="stream-skeleton mi-skeleton" style={{ height: 60, marginBottom: 8 }}></div>
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`stream-container ${compact ? 'compact' : ''}`}>
        <div className="stream-empty">No job listings available</div>
      </div>
    );
  }

  // Get unique tags for filtering
  const allTags = [...new Set(data.flatMap(d => d.semanticTags || []))];

  const filteredData = filter === 'all'
    ? data
    : data.filter(job => job.semanticTags?.includes(filter));

  const displayData = compact ? filteredData.slice(0, 3) : filteredData;

  const getTimeAgo = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  };

  const getMatchColor = (score) => {
    if (score >= 90) return '#00ffc8';
    if (score >= 75) return '#00b4d8';
    if (score >= 60) return '#f59e0b';
    return '#64748b';
  };

  return (
    <div className={`stream-container ${compact ? 'compact' : ''}`}>
      {/* Filters */}
      {!compact && (
        <div className="stream-controls">
          <div className="stream-filters">
            <button
              className={`stream-filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({data.length})
            </button>
            {allTags.slice(0, 6).map(tag => (
              <button
                key={tag}
                className={`stream-filter-btn ${filter === tag ? 'active' : ''}`}
                onClick={() => setFilter(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <button className="stream-refresh-btn" onClick={refreshJobs}>
            ↻ Refresh
          </button>
        </div>
      )}

      {/* Job listings */}
      <div className="stream-list">
        {displayData.map((job, index) => (
          <div
            key={job.id}
            className={`stream-item ${animatingIds.has(job.id) ? 'animate-in' : ''}`}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="stream-item-main">
              <div className="stream-item-header">
                <h4 className="stream-job-title">{job.title}</h4>
                <span
                  className="stream-match-score"
                  style={{ color: getMatchColor(job.matchScore) }}
                >
                  {job.matchScore}% match
                </span>
              </div>
              <div className="stream-job-meta">
                <span className="stream-company">{job.company}</span>
                <span className="stream-separator">•</span>
                <span className="stream-location">{job.location}</span>
                {job.salary && (
                  <>
                    <span className="stream-separator">•</span>
                    <span className="stream-salary">{job.salary}</span>
                  </>
                )}
              </div>
              {!compact && (
                <div className="stream-tags">
                  {job.semanticTags?.map(tag => (
                    <span key={tag} className="stream-tag">{tag}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="stream-item-side">
              <span className="stream-time">{getTimeAgo(job.postedDate)}</span>
              <span className={`stream-source source-${job.source}`}>{job.source}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Stream status */}
      {!compact && (
        <div className="stream-status">
          <span className="stream-status-dot"></span>
          <span className="stream-status-text">
            Monitoring {data.length} active listings • Auto-refresh in 60s
          </span>
        </div>
      )}
    </div>
  );
}

export default StreamMatrix;
