/**
 * CampusMap - Full overview of campus with fast-travel and explored/unexplored states.
 */
import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext';
import campusConfig from '../../data/campusConfig.json';
import './CampusMap.css';

function CampusMap({ onFastTravel, onClose, onSetWaypoint }) {
  const { exploredBuildings, playerPosition } = useGame();
  const [confirmTarget, setConfirmTarget] = useState(null);
  const { worldSize } = campusConfig;

  const allBuildings = useMemo(() => {
    const buildings = [];
    for (const zone of campusConfig.zones) {
      for (const building of zone.buildings) {
        buildings.push({ ...building, zonePalette: zone.palette, zoneLabel: zone.label });
      }
    }
    for (const building of campusConfig.specialBuildings) {
      buildings.push({ ...building, zonePalette: ['#4A90D9'], zoneLabel: 'Special' });
    }
    return buildings;
  }, []);

  const handleBuildingClick = (building) => {
    setConfirmTarget(building);
  };

  const handleConfirmTravel = () => {
    if (confirmTarget && onFastTravel) {
      onFastTravel(confirmTarget.id);
    }
    setConfirmTarget(null);
  };

  const handleCancel = () => {
    setConfirmTarget(null);
  };

  return (
    <div className="campus-map-overlay" role="dialog" aria-label="Campus Map">
      <div className="campus-map">
        <div className="campus-map__header">
          <h2>Campus Map</h2>
          <button onClick={onClose} className="campus-map__close" aria-label="Close map">✕</button>
        </div>

        <div className="campus-map__content">
          <svg
            viewBox={`0 0 ${worldSize.width} ${worldSize.height}`}
            className="campus-map__svg"
            role="img"
            aria-label="Interactive campus map"
          >
            {/* Zones */}
            {campusConfig.zones.map(zone => (
              <g key={zone.id}>
                <rect
                  x={zone.bounds.x}
                  y={zone.bounds.y}
                  width={zone.bounds.width}
                  height={zone.bounds.height}
                  fill={zone.palette[0]}
                  opacity={0.2}
                  rx={20}
                />
                <text
                  x={zone.bounds.x + 30}
                  y={zone.bounds.y + 40}
                  fill={zone.palette[0]}
                  fontSize={48}
                  fontWeight="bold"
                >
                  {zone.label}
                </text>
              </g>
            ))}

            {/* Buildings */}
            {allBuildings.map(building => {
              const isExplored = exploredBuildings.includes(building.id);
              return (
                <g
                  key={building.id}
                  onClick={() => handleBuildingClick(building)}
                  className="campus-map__building"
                  role="button"
                  aria-label={`${building.label}${isExplored ? ' (visited)' : ' (unexplored)'}`}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleBuildingClick(building)}
                >
                  <rect
                    x={building.position.x - 40}
                    y={building.position.y - 40}
                    width={80}
                    height={80}
                    fill={isExplored ? building.zonePalette[1] || '#4A90D9' : '#666'}
                    opacity={isExplored ? 1 : 0.5}
                    rx={8}
                    stroke={isExplored ? '#FFD700' : '#999'}
                    strokeWidth={isExplored ? 3 : 1}
                  />
                  <text
                    x={building.position.x}
                    y={building.position.y + 60}
                    fill="#fff"
                    fontSize={24}
                    textAnchor="middle"
                  >
                    {building.label}
                  </text>
                </g>
              );
            })}

            {/* Player position */}
            <circle
              cx={playerPosition.x}
              cy={playerPosition.y}
              r={28}
              fill="#FF4757"
              stroke="#FFF"
              strokeWidth={5}
            />
          </svg>
        </div>

        {/* Fast travel confirmation */}
        {confirmTarget && (
          <div className="campus-map__confirm" role="alertdialog" aria-label="Fast travel confirmation">
            <p>What would you like to do at <strong>{confirmTarget.label}</strong>?</p>
            <div className="campus-map__confirm-btns">
              <button onClick={handleConfirmTravel} className="btn-confirm">Fast Travel</button>
              <button onClick={() => { onSetWaypoint && onSetWaypoint(confirmTarget); setConfirmTarget(null); onClose(); }} className="btn-confirm" style={{ background: '#F39C12' }}>Set Waypoint</button>
              <button onClick={handleCancel} className="btn-cancel">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CampusMap;
