/**
 * Hotbar - Bottom action bar for quick access to campus features.
 * Inspired by RPG/Prodigy action bars.
 */
import React from 'react';
import './Hotbar.css';

function Hotbar({ onMap, onQuests, onProfile, onSettings, onTextNav, onTrivia, onSocial, badges = {} }) {
  return (
    <div className="hotbar" role="toolbar" aria-label="Quick actions">
      <button className="hotbar__btn" onClick={onMap} title="Map (M)" aria-label="Open map">
        <span className="hotbar__icon">🗺️</span>
        <span className="hotbar__label">Map</span>
        <kbd className="hotbar__key">M</kbd>
        {badges.map > 0 && <span className="hotbar__badge">{badges.map}</span>}
      </button>
      <button className="hotbar__btn" onClick={onQuests} title="Quests (Q)" aria-label="Open quests">
        <span className="hotbar__icon">📋</span>
        <span className="hotbar__label">Quests</span>
        <kbd className="hotbar__key">Q</kbd>
        {badges.quests > 0 && <span className="hotbar__badge">{badges.quests}</span>}
      </button>
      <button className="hotbar__btn" onClick={onSocial} title="Social (P)" aria-label="Open social panel">
        <span className="hotbar__icon">👥</span>
        <span className="hotbar__label">Social</span>
        <kbd className="hotbar__key">P</kbd>
        {badges.social > 0 && <span className="hotbar__badge">{badges.social}</span>}
      </button>
      <button className="hotbar__btn" onClick={onTextNav} title="Buildings (Alt+T)" aria-label="Text navigation">
        <span className="hotbar__icon">🏢</span>
        <span className="hotbar__label">Buildings</span>
      </button>
      <button className="hotbar__btn" onClick={onProfile} title="Profile" aria-label="Open profile">
        <span className="hotbar__icon">👤</span>
        <span className="hotbar__label">Profile</span>
      </button>
      <button className="hotbar__btn hotbar__btn--trivia" onClick={onTrivia} title="Trivia" aria-label="STEM Trivia">
        <span className="hotbar__icon">💡</span>
        <span className="hotbar__label">Trivia</span>
        {badges.trivia > 0 && <span className="hotbar__badge">{badges.trivia}</span>}
      </button>
      <button className="hotbar__btn" onClick={onSettings} title="Settings" aria-label="Open settings">
        <span className="hotbar__icon">⚙️</span>
        <span className="hotbar__label">Settings</span>
      </button>
    </div>
  );
}

export default Hotbar;
