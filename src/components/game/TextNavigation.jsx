/**
 * TextNavigation - Accessible text-based campus navigation mode.
 * Toggle via Alt+T or persistent on-screen button.
 * Provides feature parity with the visual campus world.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../../context/GameContext';
import campusConfig from '../../data/campusConfig.json';
import './TextNavigation.css';

function TextNavigation({ onEnterBuilding, onInteractNPC, onClose }) {
  const { exploredBuildings } = useGame();
  const [activeSection, setActiveSection] = useState('buildings');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const listRef = useRef(null);
  const triggerRef = useRef(null);

  const allBuildings = React.useMemo(() => {
    const buildings = [];
    for (const zone of campusConfig.zones) {
      for (const building of zone.buildings) {
        buildings.push({ ...building, zoneLabel: zone.label });
      }
    }
    for (const building of campusConfig.specialBuildings) {
      buildings.push({ ...building, zoneLabel: 'Special Facilities' });
    }
    return buildings;
  }, []);

  const npcs = campusConfig.npcs;

  const currentList = activeSection === 'buildings' ? allBuildings : npcs;

  // Focus trap
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose && onClose();
      // Restore focus to trigger element
      if (triggerRef.current) triggerRef.current.focus();
      return;
    }
    if (e.key === 'Tab') {
      // Keep focus within the panel
      const focusable = listRef.current?.querySelectorAll('button, [tabindex="0"]');
      if (focusable && focusable.length > 0) {
        if (e.shiftKey && document.activeElement === focusable[0]) {
          e.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
          e.preventDefault();
          focusable[0].focus();
        }
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => Math.min(prev + 1, currentList.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => Math.max(prev - 1, 0));
    }
    if (e.key === 'Enter' && currentList[focusedIndex]) {
      if (activeSection === 'buildings') {
        onEnterBuilding && onEnterBuilding(currentList[focusedIndex].id);
      } else {
        onInteractNPC && onInteractNPC(currentList[focusedIndex].id);
      }
    }
  }, [activeSection, currentList, focusedIndex, onClose, onEnterBuilding, onInteractNPC]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [activeSection]);

  return (
    <div
      className="text-nav"
      role="dialog"
      aria-label="Text-based campus navigation"
      aria-modal="true"
      onKeyDown={handleKeyDown}
      ref={listRef}
    >
      <div className="text-nav__header">
        <h2 id="text-nav-title">Campus Navigation</h2>
        <button
          onClick={onClose}
          className="text-nav__close"
          aria-label="Close text navigation"
        >
          ✕
        </button>
      </div>

      <div className="text-nav__tabs" role="tablist">
        <button
          role="tab"
          aria-selected={activeSection === 'buildings'}
          className={`text-nav__tab ${activeSection === 'buildings' ? 'active' : ''}`}
          onClick={() => setActiveSection('buildings')}
        >
          Buildings ({allBuildings.length})
        </button>
        <button
          role="tab"
          aria-selected={activeSection === 'npcs'}
          className={`text-nav__tab ${activeSection === 'npcs' ? 'active' : ''}`}
          onClick={() => setActiveSection('npcs')}
        >
          NPCs ({npcs.length})
        </button>
      </div>

      <div className="text-nav__list" role="listbox" aria-labelledby="text-nav-title">
        {activeSection === 'buildings' && allBuildings.map((building, idx) => {
          const isExplored = exploredBuildings.includes(building.id);
          return (
            <button
              key={building.id}
              className={`text-nav__item ${idx === focusedIndex ? 'focused' : ''}`}
              onClick={() => onEnterBuilding && onEnterBuilding(building.id)}
              role="option"
              aria-selected={idx === focusedIndex}
              aria-label={`${building.label} in ${building.zoneLabel}${isExplored ? ' - visited' : ' - unexplored'}`}
            >
              <span className="text-nav__icon">{building.icon || '🏢'}</span>
              <div className="text-nav__info">
                <span className="text-nav__name">{building.label}</span>
                <span className="text-nav__zone">{building.zoneLabel}</span>
              </div>
              <span className={`text-nav__status ${isExplored ? 'explored' : 'unexplored'}`}>
                {isExplored ? '✓ Visited' : 'New'}
              </span>
            </button>
          );
        })}

        {activeSection === 'npcs' && npcs.map((npc, idx) => (
          <button
            key={npc.id}
            className={`text-nav__item ${idx === focusedIndex ? 'focused' : ''}`}
            onClick={() => onInteractNPC && onInteractNPC(npc.id)}
            role="option"
            aria-selected={idx === focusedIndex}
            aria-label={`Talk to ${npc.label} - topic: ${npc.topic}`}
          >
            <span className="text-nav__icon">👤</span>
            <div className="text-nav__info">
              <span className="text-nav__name">{npc.label}</span>
              <span className="text-nav__zone">Topic: {npc.topic}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="text-nav__help" aria-live="polite">
        Use ↑↓ arrows to navigate, Enter to select, Escape to close
      </div>
    </div>
  );
}

/**
 * Hook to toggle text navigation with Alt+T.
 */
export function useTextNavToggle() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return [isOpen, setIsOpen];
}

export default TextNavigation;
