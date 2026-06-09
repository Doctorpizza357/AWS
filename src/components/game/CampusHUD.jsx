/**
 * CampusHUD - Heads-up display overlay showing XP, level, active quests, minimap, and controls.
 * Renders as a React component on top of the Game Engine Layer canvas.
 */
import React, { useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import campusConfig from '../../data/campusConfig.json';
import questsData from '../../data/quests.json';
import './CampusHUD.css';

function Minimap({ playerPosition, buildings, zones, onBuildingClick }) {
  const { worldSize } = campusConfig;
  const minimapWidth = 180;
  const minimapHeight = 135;

  const playerIndicator = useMemo(() => {
    const x = (playerPosition.x / worldSize.width) * minimapWidth;
    const y = (playerPosition.y / worldSize.height) * minimapHeight;
    return { x, y };
  }, [playerPosition, worldSize.width, worldSize.height]);

  return (
    <div className="minimap" role="img" aria-label="Campus minimap showing player position">
      <svg width={minimapWidth} height={minimapHeight} className="minimap__svg">
        {/* Zone backgrounds */}
        {zones.map(zone => (
          <rect
            key={zone.id}
            x={(zone.bounds.x / worldSize.width) * minimapWidth}
            y={(zone.bounds.y / worldSize.height) * minimapHeight}
            width={(zone.bounds.width / worldSize.width) * minimapWidth}
            height={(zone.bounds.height / worldSize.height) * minimapHeight}
            fill={zone.palette[0]}
            opacity={0.3}
            rx={2}
          />
        ))}

        {/* Building dots */}
        {buildings.map(building => (
          <circle
            key={building.id}
            cx={(building.position.x / worldSize.width) * minimapWidth}
            cy={(building.position.y / worldSize.height) * minimapHeight}
            r={3}
            fill="#FFD700"
            className="minimap__building"
            onClick={() => onBuildingClick && onBuildingClick(building.id)}
            role="button"
            aria-label={`Fast travel to ${building.label}`}
          />
        ))}

        {/* Player indicator */}
        <circle
          cx={playerIndicator.x}
          cy={playerIndicator.y}
          r={4}
          fill="#FF4757"
          stroke="#FFF"
          strokeWidth={1.5}
          className="minimap__player"
        />
      </svg>
    </div>
  );
}

function QuestTracker({ activeQuests }) {
  if (!activeQuests || activeQuests.length === 0) return null;

  return (
    <div className="quest-tracker" role="region" aria-label="Active quests">
      <h3 className="quest-tracker__title">Active Quests</h3>
      {activeQuests.slice(0, 3).map(quest => {
        const questDef = questsData.find(q => q.id === (quest.questId || quest.id));
        const totalTasks = questDef ? questDef.tasks.length : '?';
        const completedCount = quest.completedTasks ? quest.completedTasks.length : 0;
        const title = questDef ? questDef.title : (quest.title || quest.questId);
        return (
          <div key={quest.questId || quest.id} className="quest-tracker__item">
            <span className="quest-tracker__name">{title}</span>
            <span className="quest-tracker__progress">
              {completedCount}/{totalTasks}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CampusHUD({
  activeQuests = [],
  isCompactMode = false,
  onFastTravel,
  onBackToCampus,
  audioVolume = 50,
  audioMuted = false,
  onVolumeChange,
  onMuteToggle,
  xp = 0,
  level = 1,
  xpToNext = 100,
}) {
  const { playerPosition } = useGame();

  const allBuildings = useMemo(() => {
    const buildings = [];
    for (const zone of campusConfig.zones) {
      buildings.push(...zone.buildings);
    }
    buildings.push(...campusConfig.specialBuildings);
    return buildings;
  }, []);

  const progressPercent = xpToNext > 0 ? Math.min(100, (xp / xpToNext) * 100) : 0;

  // Compact mode: show minimal bar inside feature screens
  if (isCompactMode) {
    return (
      <div className="campus-hud campus-hud--compact" role="banner" aria-label="Campus status bar">
        <div className="campus-hud__xp-compact">
          <span className="campus-hud__xp-value" aria-live="polite">{xp} XP</span>
          <span className="campus-hud__level">Lv {level}</span>
        </div>
        <button
          className="campus-hud__back-btn"
          onClick={onBackToCampus}
          aria-label="Return to campus"
        >
          ← Back to Campus
        </button>
      </div>
    );
  }

  return (
    <div className="campus-hud" role="banner" aria-label="Campus heads-up display">
      {/* XP and Level section */}
      <div className="campus-hud__stats">
        <div className="campus-hud__level-badge" aria-label={`Level ${level}`}>
          Lv {level}
        </div>
        <div className="campus-hud__xp-section">
          <span className="campus-hud__xp-text" aria-live="polite">{xp} XP</span>
          <div
            className="campus-hud__progress-bar"
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Experience progress to next level"
          >
            <div
              className="campus-hud__progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Quest Tracker */}
      <QuestTracker activeQuests={activeQuests} />

      {/* Minimap */}
      <Minimap
        playerPosition={playerPosition}
        buildings={allBuildings}
        zones={campusConfig.zones}
        onBuildingClick={onFastTravel}
      />

      {/* Audio controls */}
      <div className="campus-hud__audio" role="group" aria-label="Audio controls">
        <button
          className="campus-hud__mute-btn"
          onClick={onMuteToggle}
          aria-label={audioMuted ? 'Unmute audio' : 'Mute audio'}
          aria-pressed={audioMuted}
        >
          {audioMuted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          value={audioVolume}
          onChange={(e) => onVolumeChange && onVolumeChange(Number(e.target.value))}
          className="campus-hud__volume-slider"
          aria-label="Volume"
        />
      </div>
    </div>
  );
}

export { Minimap, QuestTracker };
export default CampusHUD;
