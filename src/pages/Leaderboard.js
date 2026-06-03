import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { getIconComponent } from '../utils/iconMap';
import './Leaderboard.css';

/**
 * Compute the total lifetime XP a user has earned across all levels.
 * The leveling formula uses a 1.5x multiplier per level (base 100).
 */
function computeTotalXP(progress) {
  if (!progress) return 0;
  const level = progress.level || 1;
  const currentXP = progress.xp || 0;

  let total = 0;
  let threshold = 100;
  for (let i = 1; i < level; i++) {
    total += threshold;
    threshold = Math.floor(threshold * 1.5);
  }
  total += currentXP;
  return total;
}

function Leaderboard() {
  const { user: authUser } = useAuth();
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const TrophyIcon = getIconComponent('badge-level-10');
  const LevelIcon = getIconComponent('stat-level');
  const BadgeIcon = getIconComponent('stat-badges');

  const handleUserClick = async (entry) => {
    setProfileLoading(true);
    setSelectedUser({ ...entry, profile: null });
    try {
      const userDoc = await getDoc(doc(db, 'users', entry.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setSelectedUser({
          ...entry,
          profile: data.profile || {},
          progress: data.progress || {},
          recommendedCareers: data.recommendedCareers || [],
          activeCareerGoal: data.activeCareerGoal || null,
        });
      }
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
    }
    setProfileLoading(false);
  };

  const closeProfile = () => {
    setSelectedUser(null);
  };

  useEffect(() => {
    let mounted = true;

    async function fetchLeaderboard() {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const entries = [];

        usersSnap.forEach((doc) => {
          const data = doc.data();
          const progress = data.progress || {};
          const totalXP = computeTotalXP(progress);

          // Only include users who have some progress
          if (totalXP > 0 || (progress.level && progress.level > 1)) {
            entries.push({
              uid: doc.id,
              displayName: data.displayName || data.profile?.name || 'Anonymous Explorer',
              photoURL: data.photoURL || '',
              level: progress.level || 1,
              totalXP,
              badges: progress.badges?.length || 0,
              scenarios: progress.completedScenarios?.length || 0,
            });
          }
        });

        entries.sort((a, b) => b.totalXP - a.totalXP);

        if (mounted) {
          setLeaders(entries);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
        if (mounted) {
          setError('Unable to load leaderboard. Please try again later.');
          setLoading(false);
        }
      }
    }

    fetchLeaderboard();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="leaderboard">
        <div className="container">
          <div className="leaderboard-loading">Loading leaderboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="leaderboard">
        <div className="container">
          <div className="leaderboard-error">{error}</div>
        </div>
      </div>
    );
  }

  const currentUserRank = authUser
    ? leaders.findIndex((l) => l.uid === authUser.uid) + 1
    : null;

  return (
    <div className="leaderboard">
      <div className="container">
        <header className="leaderboard-header fade-in">
          <div className="leaderboard-title-row">
            <TrophyIcon size={28} aria-hidden="true" className="leaderboard-trophy" />
            <h1>Leaderboard</h1>
          </div>
          <p className="leaderboard-subtitle">
            See how you rank against other explorers. Earn XP through scenarios, decisions, and badges.
          </p>
          {currentUserRank > 0 && (
            <div className="leaderboard-your-rank">
              You are ranked <strong>#{currentUserRank}</strong> out of {leaders.length} explorer{leaders.length !== 1 ? 's' : ''}
            </div>
          )}
        </header>

        {leaders.length === 0 ? (
          <div className="leaderboard-empty">
            <p>No explorers on the board yet. Complete scenarios to be the first!</p>
          </div>
        ) : (
          <div className="leaderboard-table" role="table" aria-label="Leaderboard rankings">
            <div className="leaderboard-row leaderboard-row--header" role="row">
              <span className="lb-col lb-col--rank" role="columnheader">Rank</span>
              <span className="lb-col lb-col--user" role="columnheader">Explorer</span>
              <span className="lb-col lb-col--level" role="columnheader">Level</span>
              <span className="lb-col lb-col--xp" role="columnheader">Total XP</span>
              <span className="lb-col lb-col--badges" role="columnheader">Badges</span>
            </div>

            {leaders.map((entry, index) => {
              const rank = index + 1;
              const isCurrentUser = authUser && entry.uid === authUser.uid;
              const medalClass =
                rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';

              return (
                <div
                  key={entry.uid}
                  className={`leaderboard-row ${isCurrentUser ? 'leaderboard-row--you' : ''} ${medalClass ? `leaderboard-row--${medalClass}` : ''}`}
                  role="row"
                  onClick={() => handleUserClick(entry)}
                  style={{ cursor: 'pointer' }}
                  title={`View ${entry.displayName}'s profile`}
                >
                  <span className="lb-col lb-col--rank" role="cell">
                    <span className={`rank-badge ${medalClass}`}>{rank}</span>
                  </span>
                  <span className="lb-col lb-col--user" role="cell">
                    {entry.photoURL ? (
                      <img src={entry.photoURL} alt="" className="lb-avatar" />
                    ) : (
                      <span className="lb-avatar lb-avatar--placeholder">
                        {entry.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="lb-username">
                      {entry.displayName}
                      {isCurrentUser && <span className="lb-you-tag">You</span>}
                    </span>
                  </span>
                  <span className="lb-col lb-col--level" role="cell">
                    <LevelIcon size={14} aria-hidden="true" />
                    {entry.level}
                  </span>
                  <span className="lb-col lb-col--xp" role="cell">
                    {entry.totalXP.toLocaleString()} XP
                  </span>
                  <span className="lb-col lb-col--badges" role="cell">
                    <BadgeIcon size={14} aria-hidden="true" />
                    {entry.badges}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {selectedUser && (
          <div className="lb-profile-overlay" onClick={closeProfile}>
            <div className="lb-profile-modal" onClick={(e) => e.stopPropagation()}>
              <button className="lb-profile-close" onClick={closeProfile} aria-label="Close profile">×</button>
              <div className="lb-profile-header">
                {selectedUser.photoURL ? (
                  <img src={selectedUser.photoURL} alt="" className="lb-profile-avatar" />
                ) : (
                  <span className="lb-profile-avatar lb-profile-avatar--placeholder">
                    {selectedUser.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="lb-profile-info">
                  <h2>{selectedUser.displayName}</h2>
                  <span className="lb-profile-level">Level {selectedUser.level} Explorer</span>
                  {selectedUser.activeCareerGoal && (
                    <span className="lb-profile-goal">Goal: {selectedUser.activeCareerGoal.title}</span>
                  )}
                </div>
              </div>

              {profileLoading ? (
                <div className="lb-profile-loading">Loading profile...</div>
              ) : selectedUser.profile ? (
                <div className="lb-profile-body">
                  <div className="lb-profile-stats">
                    <div className="lb-profile-stat">
                      <span className="lb-profile-stat-val">{selectedUser.totalXP.toLocaleString()}</span>
                      <span className="lb-profile-stat-lbl">Total XP</span>
                    </div>
                    <div className="lb-profile-stat">
                      <span className="lb-profile-stat-val">{selectedUser.level}</span>
                      <span className="lb-profile-stat-lbl">Level</span>
                    </div>
                    <div className="lb-profile-stat">
                      <span className="lb-profile-stat-val">{selectedUser.badges}</span>
                      <span className="lb-profile-stat-lbl">Badges</span>
                    </div>
                    <div className="lb-profile-stat">
                      <span className="lb-profile-stat-val">{selectedUser.scenarios}</span>
                      <span className="lb-profile-stat-lbl">Scenarios</span>
                    </div>
                  </div>

                  {selectedUser.profile.interests?.length > 0 && (
                    <div className="lb-profile-section">
                      <h3>Interests</h3>
                      <div className="lb-profile-tags">
                        {selectedUser.profile.interests.map((t) => (
                          <span key={t} className="lb-profile-tag">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedUser.profile.skills?.length > 0 && (
                    <div className="lb-profile-section">
                      <h3>Skills</h3>
                      <div className="lb-profile-tags">
                        {selectedUser.profile.skills.map((t) => (
                          <span key={t} className="lb-profile-tag lb-profile-tag--skill">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedUser.progress?.badges?.length > 0 && (
                    <div className="lb-profile-section">
                      <h3>Badges Earned</h3>
                      <div className="lb-profile-badges">
                        {selectedUser.progress.badges.map((b) => {
                          const BIcon = getIconComponent(b.icon);
                          return (
                            <div key={b.id} className="lb-profile-badge">
                              <BIcon size={18} aria-hidden="true" />
                              <span>{b.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Leaderboard;
