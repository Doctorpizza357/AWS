import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { fetchRoleModelMatches } from '../services/aiService';
import { Users, ExternalLink, Sparkles, ArrowRight } from 'lucide-react';
import './RoleModelPreview.css';

/**
 * RoleModelPreview — a compact card on the Dashboard that shows one
 * matched role model and invites the user to explore more.
 */
function RoleModelPreview() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [roleModel, setRoleModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!user.isOnboarded) return;
    setLoading(true);
    setError(false);
    try {
      const matches = await fetchRoleModelMatches({
        profile: user.profile,
        activeCareerGoal: user.activeCareerGoal,
        recommendedCareers: user.recommendedCareers?.slice(0, 3),
      });
      if (matches.length > 0) {
        setRoleModel(matches[0]);
      }
    } catch (err) {
      console.error('Role model preview fetch failed:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [user.isOnboarded, user.profile, user.activeCareerGoal, user.recommendedCareers]);

  useEffect(() => {
    if (user.isOnboarded && !roleModel && !loading && !error) {
      loadPreview();
    }
  }, [user.isOnboarded, roleModel, loading, error, loadPreview]);

  // Don't render anything if loading failed or no data
  if (error || (!loading && !roleModel)) return null;

  return (
    <section className="rm-preview-section" aria-labelledby="rm-preview-heading">
      <div className="rm-preview-header">
        <h2 id="rm-preview-heading" className="section-heading">
          <Users size={20} className="rm-preview-heading-icon" />
          Your Role Model Match
        </h2>
        <p className="section-desc">A real STEM professional who shares your path</p>
      </div>

      {loading && (
        <div className="rm-preview-loading">
          <div className="rm-preview-spinner" />
          <span>Finding your match...</span>
        </div>
      )}

      {!loading && roleModel && (
        <div className="rm-preview-card">
          <div className="rm-preview-card-left">
            <div className="rm-preview-avatar">
              {roleModel.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </div>
            <div className="rm-preview-info">
              <h3>{roleModel.name}</h3>
              <span className="rm-preview-role">{roleModel.title}</span>
              <span className="rm-preview-org">{roleModel.organization}</span>
            </div>
          </div>

          <div className="rm-preview-match">
            <Sparkles size={14} />
            <span>{roleModel.matchReason}</span>
          </div>

          <div className="rm-preview-actions">
            {roleModel.sourceUrl && (
              <a
                href={roleModel.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rm-preview-link"
              >
                <ExternalLink size={14} /> Search Online
              </a>
            )}
            <button
              className="rm-preview-explore-btn"
              onClick={() => navigate('/role-models')}
              type="button"
            >
              See All Matches <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default RoleModelPreview;
