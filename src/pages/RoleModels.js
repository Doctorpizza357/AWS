import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { fetchRoleModelMatches } from '../services/aiService';
import { Users, ExternalLink, RefreshCw, Sparkles, Award, Briefcase, ArrowLeft } from 'lucide-react';
import './RoleModels.css';

function RoleModels() {
  const navigate = useNavigate();
  const { user, isHydrating } = useUser();
  const [roleModels, setRoleModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!isHydrating && !user.isOnboarded) {
      navigate('/onboarding');
    }
  }, [isHydrating, user.isOnboarded, navigate]);

  const hasLoadedRef = useRef(false);

  const loadRoleModels = async () => {
    if (!user.isOnboarded) return;
    setLoading(true);
    setError(null);
    try {
      const matches = await fetchRoleModelMatches({
        profile: user.profile,
        activeCareerGoal: user.activeCareerGoal,
        recommendedCareers: user.recommendedCareers?.slice(0, 3),
      });
      setRoleModels(matches);
      setHasLoaded(true);
    } catch (err) {
      console.error('Role model fetch failed:', err);
      setError(err.message || 'Failed to find role models. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user.isOnboarded && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadRoleModels();
    }
  });

  if (isHydrating || !user.isOnboarded) return null;

  return (
    <div className="role-models-page">
      <div className="container">
        <button className="rm-back-btn" onClick={() => navigate('/dashboard')} type="button">
          <ArrowLeft size={18} /> Back to Dashboard
        </button>

        <header className="rm-header">
          <div className="rm-header-icon">
            <Users size={28} />
          </div>
          <div>
            <h1>Your STEM Role Models</h1>
            <p className="rm-header-sub">
              Real professionals who share your interests and career aspirations. Get inspired by their journeys.
            </p>
          </div>
        </header>

        {user.activeCareerGoal && (
          <div className="rm-context-banner">
            <Sparkles size={16} />
            <span>Matched based on your goal: <strong>{user.activeCareerGoal.title}</strong></span>
          </div>
        )}

        {loading && (
          <div className="rm-loading">
            <div className="rm-loading-spinner" />
            <p>Finding role models who match your profile...</p>
          </div>
        )}

        {error && (
          <div className="rm-error">
            <p>{error}</p>
            <button onClick={loadRoleModels} type="button" className="rm-retry-btn">
              <RefreshCw size={16} /> Try Again
            </button>
          </div>
        )}

        {!loading && !error && roleModels.length > 0 && (
          <>
            <div className="rm-grid">
              {roleModels.map((model, index) => (
                <article
                  key={model.id || index}
                  className="rm-card"
                >
                  <div className="rm-card-header">
                    <div className="rm-avatar">
                      {model.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="rm-card-title">
                      <h2>{model.name}</h2>
                      <span className="rm-role">{model.title}</span>
                      <span className="rm-org">{model.organization}</span>
                    </div>
                    <span className="rm-field-badge">{model.field}</span>
                  </div>

                  <p className="rm-bio">{model.bio}</p>

                  <div className="rm-match-reason">
                    <Sparkles size={14} />
                    <span><strong>Why they match you:</strong> {model.matchReason}</span>
                  </div>

                  {model.achievements && model.achievements.length > 0 && (
                    <div className="rm-achievements">
                      <h3><Award size={14} /> Key Achievements</h3>
                      <ul>
                        {model.achievements.map((achievement, i) => (
                          <li key={i}>{achievement}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {model.sourceUrl && (
                    <a
                      href={model.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rm-source-link"
                    >
                      <ExternalLink size={14} />
                      Search for {model.name.split(' ')[0]}
                    </a>
                  )}
                </article>
              ))}
            </div>

            <div className="rm-refresh-section">
              <button
                onClick={loadRoleModels}
                type="button"
                className="rm-refresh-btn"
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? 'spinning' : ''} />
                Find Different Role Models
              </button>
              <p className="rm-refresh-hint">Each search finds new inspiring professionals based on your profile</p>
            </div>
          </>
        )}

        {!loading && !error && hasLoaded && roleModels.length === 0 && (
          <div className="rm-empty">
            <Briefcase size={40} />
            <h2>No matches found</h2>
            <p>Try setting an active career goal or updating your profile to get personalized role model matches.</p>
            <button onClick={() => navigate('/profile')} type="button" className="rm-retry-btn">
              Update Profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default RoleModels;
