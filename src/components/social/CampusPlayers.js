/**
 * CampusPlayers — Social Panel
 * Shows online players on campus, friend requests, and friend list.
 * Can be used as a sidebar, overlay, or embedded panel.
 */
import React, { useState } from 'react';
import { useSocial } from '../../context/SocialContext';
import { useAuth } from '../../context/AuthContext';
import ChallengePanel from './ChallengePanel';
import './CampusPlayers.css';

function CampusPlayers({ compact = false, onJoinChallenge }) {
  const { user: authUser } = useAuth();
  const {
    onlinePlayers,
    onlineFriends,
    friends,
    pendingRequests,
    sendRequest,
    acceptRequest,
    rejectRequest,
    unfriend,
    isFriend,
    hasPendingRequest,
  } = useSocial();

  const [activeTab, setActiveTab] = useState('online');
  const [actionLoading, setActionLoading] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const clearMessages = () => {
    setTimeout(() => { setActionError(''); setActionSuccess(''); }, 3000);
  };

  const handleSendRequest = async (toUid) => {
    setActionLoading(toUid);
    setActionError('');
    try {
      const result = await sendRequest(toUid);
      if (result.autoAccepted) {
        setActionSuccess('Friend added! They had already sent you a request.');
      } else {
        setActionSuccess('Friend request sent!');
      }
      clearMessages();
    } catch (err) {
      setActionError(err.message);
      clearMessages();
    }
    setActionLoading(null);
  };

  const handleAccept = async (requestId, fromUid) => {
    setActionLoading(requestId);
    try {
      await acceptRequest(requestId, fromUid);
      setActionSuccess('Friend request accepted!');
      clearMessages();
    } catch (err) {
      setActionError(err.message);
      clearMessages();
    }
    setActionLoading(null);
  };

  const handleReject = async (requestId) => {
    setActionLoading(requestId);
    try {
      await rejectRequest(requestId);
    } catch (err) {
      setActionError(err.message);
      clearMessages();
    }
    setActionLoading(null);
  };

  const handleUnfriend = async (friendUid) => {
    setActionLoading(friendUid);
    try {
      await unfriend(friendUid);
      setActionSuccess('Friend removed.');
      clearMessages();
    } catch (err) {
      setActionError(err.message);
      clearMessages();
    }
    setActionLoading(null);
  };

  if (!authUser) {
    return (
      <div className="campus-players">
        <p className="cp-empty">Log in to see other players on campus.</p>
      </div>
    );
  }

  return (
    <div className={`campus-players ${compact ? 'compact' : ''}`}>
      <div className="cp-header">
        <h3>Campus Social</h3>
        <div className="cp-badges">
          <span className="cp-online-count">{onlinePlayers.length} online</span>
          {pendingRequests.length > 0 && (
            <span className="cp-request-badge">{pendingRequests.length}</span>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="cp-tabs">
        <button
          className={`cp-tab ${activeTab === 'online' ? 'active' : ''}`}
          onClick={() => setActiveTab('online')}
        >
          Online ({onlinePlayers.length})
        </button>
        <button
          className={`cp-tab ${activeTab === 'friends' ? 'active' : ''}`}
          onClick={() => setActiveTab('friends')}
        >
          Friends ({friends.length})
        </button>
        <button
          className={`cp-tab ${activeTab === 'challenge' ? 'active' : ''}`}
          onClick={() => setActiveTab('challenge')}
        >
          Challenge
        </button>
        <button
          className={`cp-tab ${activeTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          Requests
          {pendingRequests.length > 0 && <span className="cp-tab-badge">{pendingRequests.length}</span>}
        </button>
      </div>

      {/* Status Messages */}
      {actionError && <div className="cp-message cp-error">{actionError}</div>}
      {actionSuccess && <div className="cp-message cp-success">{actionSuccess}</div>}

      {/* Online Players Tab */}
      {activeTab === 'online' && (
        <div className="cp-list">
          {onlinePlayers.length === 0 ? (
            <p className="cp-empty">No other players online right now.</p>
          ) : (
            onlinePlayers.map((player) => (
              <div key={player.uid} className="cp-player-card">
                <div className="cp-avatar">
                  {player.photoURL ? (
                    <img src={player.photoURL} alt="" className="cp-avatar-img" />
                  ) : (
                    <div className="cp-avatar-placeholder">
                      {(player.displayName || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="cp-status-dot online" />
                </div>
                <div className="cp-info">
                  <span className="cp-name">{player.displayName}</span>
                  <span className="cp-meta">
                    Lv.{player.level}
                    {player.activeCareer && ` · ${player.activeCareer}`}
                  </span>
                </div>
                <div className="cp-actions">
                  {isFriend(player.uid) ? (
                    <span className="cp-friend-badge">✓ Friend</span>
                  ) : hasPendingRequest(player.uid) ? (
                    <span className="cp-pending-badge">Pending</span>
                  ) : (
                    <button
                      className="cp-add-btn"
                      onClick={() => handleSendRequest(player.uid)}
                      disabled={actionLoading === player.uid}
                    >
                      {actionLoading === player.uid ? '...' : '+ Add'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Friends Tab */}
      {activeTab === 'friends' && (
        <div className="cp-list">
          {friends.length === 0 ? (
            <p className="cp-empty">No friends yet. Send requests to players you see online!</p>
          ) : (
            friends.map((friend) => {
              const isOnline = onlineFriends.some((p) => p.uid === friend.uid);
              return (
                <div key={friend.uid} className="cp-player-card">
                  <div className="cp-avatar">
                    {friend.photoURL ? (
                      <img src={friend.photoURL} alt="" className="cp-avatar-img" />
                    ) : (
                      <div className="cp-avatar-placeholder">
                        {(friend.displayName || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <span className={`cp-status-dot ${isOnline ? 'online' : 'offline'}`} />
                  </div>
                  <div className="cp-info">
                    <span className="cp-name">{friend.displayName}</span>
                    <span className="cp-meta">
                      Lv.{friend.level}
                      {isOnline ? ' · Online' : ' · Offline'}
                    </span>
                  </div>
                  <div className="cp-actions">
                    <button
                      className="cp-remove-btn"
                      onClick={() => handleUnfriend(friend.uid)}
                      disabled={actionLoading === friend.uid}
                      title="Remove friend"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Challenge Tab */}
      {activeTab === 'challenge' && (
        <ChallengePanel onJoinChallenge={onJoinChallenge} />
      )}

      {/* Friend Requests Tab */}
      {activeTab === 'requests' && (
        <div className="cp-list">
          {pendingRequests.length === 0 ? (
            <p className="cp-empty">No pending friend requests.</p>
          ) : (
            pendingRequests.map((req) => (
              <div key={req.id} className="cp-player-card cp-request-card">
                <div className="cp-avatar">
                  {req.fromPhotoURL ? (
                    <img src={req.fromPhotoURL} alt="" className="cp-avatar-img" />
                  ) : (
                    <div className="cp-avatar-placeholder">
                      {(req.fromDisplayName || '?')[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="cp-info">
                  <span className="cp-name">{req.fromDisplayName}</span>
                  <span className="cp-meta">Lv.{req.fromLevel} · Wants to be friends</span>
                </div>
                <div className="cp-actions cp-request-actions">
                  <button
                    className="cp-accept-btn"
                    onClick={() => handleAccept(req.id, req.from)}
                    disabled={actionLoading === req.id}
                  >
                    ✓
                  </button>
                  <button
                    className="cp-reject-btn"
                    onClick={() => handleReject(req.id)}
                    disabled={actionLoading === req.id}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default CampusPlayers;
