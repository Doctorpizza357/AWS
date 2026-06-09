/**
 * GameContext - React context bridging game state to React components.
 * Provides state and actions for the Campus game world.
 */
import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import EventBus, { GameEvents } from '../game/EventBus';

const GameContext = createContext(null);

const initialState = {
  isGameReady: false,
  isGamePaused: false,
  currentZone: null,
  playerPosition: { x: 0, y: 0 },
  nearbyBuilding: null,
  activeOverlay: null,
  savedPosition: null,
  exploredBuildings: [],
  playerLevel: 1,
  playerXP: 0,
  xpToNext: 100,
  tutorialCompleted: false,
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'GAME_READY':
      return { ...state, isGameReady: true };
    case 'GAME_PAUSED':
      return { ...state, isGamePaused: true };
    case 'GAME_RESUMED':
      return { ...state, isGamePaused: false };
    case 'SET_POSITION':
      return { ...state, playerPosition: action.payload };
    case 'SET_ZONE':
      return { ...state, currentZone: action.payload };
    case 'SET_NEARBY_BUILDING':
      return { ...state, nearbyBuilding: action.payload };
    case 'SET_ACTIVE_OVERLAY':
      return { ...state, activeOverlay: action.payload };
    case 'SET_SAVED_POSITION':
      return { ...state, savedPosition: action.payload };
    case 'ADD_EXPLORED_BUILDING':
      if (state.exploredBuildings.includes(action.payload)) return state;
      return { ...state, exploredBuildings: [...state.exploredBuildings, action.payload] };
    case 'SET_XP':
      return { ...state, playerXP: action.payload.xp, playerLevel: action.payload.level, xpToNext: action.payload.xpToNext };
    case 'SET_TUTORIAL_COMPLETED':
      return { ...state, tutorialCompleted: true };
    case 'RESTORE_STATE':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const eventBusRef = useRef(EventBus.getInstance());

  useEffect(() => {
    const bus = eventBusRef.current;

    const onGameReady = () => dispatch({ type: 'GAME_READY' });
    const onGamePaused = () => dispatch({ type: 'GAME_PAUSED' });
    const onGameResumed = () => dispatch({ type: 'GAME_RESUMED' });
    const onAvatarMoved = (pos) => dispatch({ type: 'SET_POSITION', payload: pos });
    const onZoneChanged = (data) => dispatch({ type: 'SET_ZONE', payload: data.currentZone });
    const onBuildingProximity = (data) => dispatch({ type: 'SET_NEARBY_BUILDING', payload: data.building });
    const onBuildingEntered = (data) => {
      dispatch({ type: 'SET_SAVED_POSITION', payload: data.savedPosition });
      dispatch({ type: 'ADD_EXPLORED_BUILDING', payload: data.buildingId });
    };
    const onXPAwarded = (data) => {
      // This would calculate level from total XP
      dispatch({ type: 'SET_XP', payload: data });
    };

    bus.on(GameEvents.GAME_READY, onGameReady);
    bus.on(GameEvents.GAME_PAUSED, onGamePaused);
    bus.on(GameEvents.GAME_RESUMED, onGameResumed);
    bus.on(GameEvents.AVATAR_MOVED, onAvatarMoved);
    bus.on(GameEvents.ZONE_CHANGED, onZoneChanged);
    bus.on(GameEvents.BUILDING_PROXIMITY, onBuildingProximity);
    bus.on(GameEvents.BUILDING_ENTERED, onBuildingEntered);
    bus.on(GameEvents.XP_AWARDED, onXPAwarded);

    return () => {
      bus.off(GameEvents.GAME_READY, onGameReady);
      bus.off(GameEvents.GAME_PAUSED, onGamePaused);
      bus.off(GameEvents.GAME_RESUMED, onGameResumed);
      bus.off(GameEvents.AVATAR_MOVED, onAvatarMoved);
      bus.off(GameEvents.ZONE_CHANGED, onZoneChanged);
      bus.off(GameEvents.BUILDING_PROXIMITY, onBuildingProximity);
      bus.off(GameEvents.BUILDING_ENTERED, onBuildingEntered);
      bus.off(GameEvents.XP_AWARDED, onXPAwarded);
    };
  }, []);

  const pauseGame = useCallback(() => {
    eventBusRef.current.emit(GameEvents.PAUSE_GAME);
  }, []);

  const resumeGame = useCallback(() => {
    eventBusRef.current.emit(GameEvents.RESUME_GAME);
  }, []);

  const teleportTo = useCallback((buildingId) => {
    eventBusRef.current.emit(GameEvents.TELEPORT_AVATAR, { buildingId });
  }, []);

  const enterBuilding = useCallback((buildingId) => {
    dispatch({ type: 'SET_ACTIVE_OVERLAY', payload: buildingId });
  }, []);

  const exitBuilding = useCallback(() => {
    dispatch({ type: 'SET_ACTIVE_OVERLAY', payload: null });
    eventBusRef.current.emit(GameEvents.RESUME_GAME);
  }, []);

  const setActiveOverlay = useCallback((id) => {
    dispatch({ type: 'SET_ACTIVE_OVERLAY', payload: id });
  }, []);

  const restoreState = useCallback((savedState) => {
    dispatch({ type: 'RESTORE_STATE', payload: savedState });
  }, []);

  const setTutorialCompleted = useCallback(() => {
    dispatch({ type: 'SET_TUTORIAL_COMPLETED' });
  }, []);

  const value = {
    ...state,
    pauseGame,
    resumeGame,
    teleportTo,
    enterBuilding,
    exitBuilding,
    setActiveOverlay,
    restoreState,
    setTutorialCompleted,
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}

export default GameContext;
