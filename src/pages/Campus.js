/**
 * Campus - Main game campus route that wires together the PixiJS game engine,
 * React overlays, HUD, quests, NPC system, and all feature integrations.
 */
import React, { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { useUser } from '../context/UserContext';
import GameEngine from '../game/GameEngine';
import CampusWorld from '../game/CampusWorld';
import PlayerAvatar from '../game/PlayerAvatar';
import TransitionBridge from '../game/TransitionBridge';
import AudioManager from '../game/AudioManager';
import NPCSystem from '../game/NPCSystem';
import EventBus, { GameEvents } from '../game/EventBus';
import QuestService from '../services/questService';
import GuidedPathService from '../services/guidedPathService';
import { checkLoginStreak } from '../services/loginStreakService';
import { parseCampusUrl } from '../routing/redirects';
import CampusHUD from '../components/game/CampusHUD';
import CampusMap from '../components/game/CampusMap';
import QuestLog from '../components/game/QuestLog';
import TextNavigation, { useTextNavToggle } from '../components/game/TextNavigation';
import LoadingScreen from '../components/game/LoadingScreen';
import AvatarCustomization from '../components/game/AvatarCustomization';
import Tutorial from '../components/game/Tutorial';
import Hotbar from '../components/game/Hotbar';
import ModalCareerSimulation from '../components/game/ModalCareerSimulation';
import WaypointIndicator from '../components/game/WaypointIndicator';
import KnowledgeOrbs, { TRIVIA_QUESTIONS } from '../components/game/KnowledgeOrbs';
import './Campus.css';
import questsData from '../data/quests.json';

// Lazy-loaded feature pages rendered as overlays inside campus
const MarketIntelligence = lazy(() => import('./MarketIntelligence'));
const InterviewHub = lazy(() => import('./InterviewHub'));
const MockInterview = lazy(() => import('./MockInterview'));
const ResumeTailor = lazy(() => import('./ResumeTailor'));
const TechnicalAssessment = lazy(() => import('./TechnicalAssessment'));
const InterviewHistory = lazy(() => import('./InterviewHistory'));
const SkillBridge = lazy(() => import('./SkillBridge'));
const Leaderboard = lazy(() => import('./Leaderboard'));
const Profile = lazy(() => import('./Profile'));
const RoleModels = lazy(() => import('./RoleModels'));

function Campus() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const worldRef = useRef(null);
  const avatarRef = useRef(null);
  const transitionRef = useRef(null);
  const audioRef = useRef(null);
  const npcSystemRef = useRef(null);
  const questServiceRef = useRef(null);
  const guidedPathRef = useRef(null);
  const positionSaveRef = useRef(null);

  const [searchParams] = useSearchParams();
  const gameContext = useGame();
  const { user, addXP, earnBadge } = useUser();

  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [showCustomization, setShowCustomization] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showQuestLog, setShowQuestLog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeQuests, setActiveQuests] = useState([]);
  const [completedQuests, setCompletedQuests] = useState([]);
  const [audioVolume, setAudioVolume] = useState(50);
  const [audioMuted, setAudioMuted] = useState(false);
  const [interactionPrompt, setInteractionPrompt] = useState(null);
  const [npcDialogue, setNpcDialogue] = useState(null);
  const [nearbyNPC, setNearbyNPC] = useState(null);
  const [activeBuilding, setActiveBuilding] = useState(null);
  const [textNavOpen, setTextNavOpen] = useTextNavToggle();
  const [waypoint, setWaypoint] = useState(null);
  const [streakNotification, setStreakNotification] = useState(null);
  const [availableQuestCount, setAvailableQuestCount] = useState(0);
  const [collectedOrbs, setCollectedOrbs] = useState(() => { try { return JSON.parse(localStorage.getItem('campus_collected_orbs') || '[]'); } catch { return []; } });
  const [showOrbQuestion, setShowOrbQuestion] = useState(false);
  const [xpToast, setXpToast] = useState(null);

  const nearbyNPCRef = useRef(null);

  // Initialize game engine
  useEffect(() => {
    let cancelled = false;

    async function initGame() {
      try {
        setLoadProgress(10);

        // Wait for ref to be attached to DOM
        const container = canvasRef.current;
        if (!container) return;

        // Create engine
        const engine = new GameEngine(container, { backgroundColor: 0x87CEEB });
        engineRef.current = engine;
        await engine.initialize();
        if (cancelled) return;
        setLoadProgress(30);

        // Create world
        const world = new CampusWorld(engine);
        worldRef.current = world;
        world.initialize();
        world.setViewport(window.innerWidth, window.innerHeight);
        setLoadProgress(50);

        // Create avatar - add to world container so camera following works
        const avatar = new PlayerAvatar(world, {
          x: gameContext.playerPosition?.x || 1600,
          y: gameContext.playerPosition?.y || 1200,
          level: user.progress.level,
          palette: JSON.parse(localStorage.getItem('campus_avatar') || '{}').palette || 'blue',
          baseStyle: JSON.parse(localStorage.getItem('campus_avatar') || '{}').baseStyle || 'style-a',
        });
        avatarRef.current = avatar;
        world.worldContainer.addChild(avatar.container);
        // Ensure avatar always renders on top of buildings
        avatar.container.zIndex = 9999;
        world.worldContainer.sortableChildren = true;
        world.setCameraTarget(avatar);
        setLoadProgress(70);

        // Create systems
        const transition = new TransitionBridge(engine);
        transitionRef.current = transition;

        const audio = new AudioManager();
        audioRef.current = audio;
        await audio.initialize();
        setAudioVolume(audio.getVolume());
        setAudioMuted(audio.isMuted());

        const npcSystem = new NPCSystem();
        npcSystemRef.current = npcSystem;

        const questService = new QuestService();
        questServiceRef.current = questService;

        const guidedPath = new GuidedPathService();
        guidedPathRef.current = guidedPath;

        setLoadProgress(90);

        // Setup transition callbacks - show feature in floating modal
        transition.setCallbacks({
          onEnter: async (buildingId) => {
            setActiveBuilding(buildingId);
            // Complete quest tasks related to visiting this building
            if (questServiceRef.current) {
              const active = questServiceRef.current.getActiveQuests();
              for (const aq of active) {
                const questId = aq.questId || aq.id;
                const questDef = questsData.find(q => q.id === questId);
                if (questDef) {
                  for (const task of questDef.tasks) {
                    if ((task.action === 'visit_building' || task.action === 'enter_building') && task.target === buildingId) {
                      questServiceRef.current.completeTask(questId, task.id);
                    }
                  }
                }
              }
              setActiveQuests([...questServiceRef.current.getActiveQuests()]);
              setAvailableQuestCount(questServiceRef.current.getAvailableQuests().length);
            }
          },
          onExit: async () => {
            setActiveBuilding(null);
          },
          onFallback: (buildingId) => {
            setActiveBuilding(buildingId);
          },
        });

        // Game loop
        engine.addTickerCallback((delta) => {
          if (!engine.isPaused) {
            avatar.update(delta);
            // Update avatar depth sort position so it renders above/below buildings correctly
            avatar.container._sortY = avatar.getPosition().y;
            world.updateCamera();
            world.loadVisibleChunks(avatar.getPosition(), window.innerWidth);

            // Check NPC proximity
            const avatarPos = avatar.getPosition();
            const npcs = world.getNPCs();
            let foundNPC = null;
            for (const npc of npcs) {
              const dx = avatarPos.x - npc.position.x;
              const dy = avatarPos.y - npc.position.y;
              if (Math.sqrt(dx * dx + dy * dy) <= 64) {
                foundNPC = npc;
                break;
              }
            }
            if (foundNPC !== nearbyNPCRef.current) {
              nearbyNPCRef.current = foundNPC;
              setNearbyNPC(foundNPC);
            }
          }
        });

        // Start engine
        engine.start();
        setLoadProgress(100);

        // Restore saved position
        const savedPos = localStorage.getItem('campus_last_position');
        if (savedPos) {
          try {
            const { x, y } = JSON.parse(savedPos);
            avatar.setPosition(x, y);
          } catch {}
        }

        // Save position every 3 seconds
        positionSaveRef.current = setInterval(() => {
          if (avatarRef.current) {
            const pos = avatarRef.current.getPosition();
            localStorage.setItem('campus_last_position', JSON.stringify(pos));
          }
        }, 3000);

        // Check for tutorial
        const tutorialDone = localStorage.getItem('campus_tutorial_completed') === 'true';
        const hasAvatar = localStorage.getItem('campus_avatar_configured') === 'true';

        if (!hasAvatar) {
          setShowCustomization(true);
        } else if (!tutorialDone) {
          setShowTutorial(true);
        }

        setLoading(false);

        // Check login streak
        const streak = checkLoginStreak();
        if (streak.isNewDay && streak.message) {
          setStreakNotification(streak);
          if (streak.bonusXP > 0) addXP(streak.bonusXP);
          setTimeout(() => setStreakNotification(null), 5000);
        }

        // Track available quests
        // Auto-activate welcome quest for new players
        if (questService.getActiveQuests().length === 0) {
          const result = questService.activateQuest('welcome-quest');
          if (result.success) {
            setActiveQuests(questService.getActiveQuests());
          }
        }
        setAvailableQuestCount(questService.getAvailableQuests().length);

        // Handle URL params (building auto-entry)
        const { building } = parseCampusUrl(searchParams.toString());
        if (building) {
          setTimeout(() => {
            setActiveBuilding(building);
            engine.pause();
          }, 500);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message || 'Failed to load campus');
        }
      }
    }

    initGame();

    return () => {
      cancelled = true;
      if (positionSaveRef.current) clearInterval(positionSaveRef.current);
      if (engineRef.current) {
        engineRef.current.destroy();
      }
      if (avatarRef.current) {
        avatarRef.current.destroy();
      }
    };
    // eslint-disable-next-line
  }, []);

  // Listen for building proximity events
  useEffect(() => {
    const bus = EventBus.getInstance();
    const onProximity = (data) => {
      setInteractionPrompt(data.inRange ? data.building : null);
    };
    bus.on(GameEvents.BUILDING_PROXIMITY, onProximity);
    return () => bus.off(GameEvents.BUILDING_PROXIMITY, onProximity);
  }, []);

  // Track zone visits for quests
  useEffect(() => {
    const bus = EventBus.getInstance();
    const onZoneChange = (data) => {
      if (questServiceRef.current && data.currentZone) {
        const active = questServiceRef.current.getActiveQuests();
        for (const aq of active) {
          const questId = aq.questId || aq.id;
          const questDef = questsData.find(q => q.id === questId);
          if (questDef) {
            for (const task of questDef.tasks) {
              if (task.action === 'visit_zone' && task.target === data.currentZone) {
                questServiceRef.current.completeTask(questId, task.id);
              }
            }
          }
        }
        setActiveQuests([...questServiceRef.current.getActiveQuests()]);
        setAvailableQuestCount(questServiceRef.current.getAvailableQuests().length);
      }
    };
    bus.on(GameEvents.ZONE_CHANGED, onZoneChange);
    return () => bus.off(GameEvents.ZONE_CHANGED, onZoneChange);
  }, []);

  // Handle interaction key (E)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'e' || e.key === 'E') {
        if (interactionPrompt && transitionRef.current && avatarRef.current) {
          transitionRef.current.enterBuilding(
            interactionPrompt.id,
            avatarRef.current.getPosition()
          );
        } else if (!interactionPrompt && nearbyNPC && npcSystemRef.current) {
          const dialogue = npcSystemRef.current.getProgressDialogue(nearbyNPC.id, user.progress);
          setNpcDialogue({ npc: nearbyNPC, text: dialogue });
        }
      }
      if (e.key === 'm' || e.key === 'M') {
        setShowMap(prev => !prev);
      }
      if (e.key === 'q' || e.key === 'Q') {
        setShowQuestLog(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [interactionPrompt, nearbyNPC]);

  // Global Escape key handler - closes any open overlay
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (activeBuilding) {
          if (transitionRef.current) transitionRef.current.exitBuilding();
          setActiveBuilding(null);
          gameContext.exitBuilding();
          return;
        }
        if (showSettings) { setShowSettings(false); return; }
        if (showMap) { setShowMap(false); return; }
        if (showQuestLog) { setShowQuestLog(false); return; }
        if (textNavOpen) { setTextNavOpen(false); return; }
        if (npcDialogue) { setNpcDialogue(null); return; }
        if (showOrbQuestion) { setShowOrbQuestion(false); return; }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [activeBuilding, showSettings, showMap, showQuestLog, textNavOpen, npcDialogue, showOrbQuestion, gameContext, setTextNavOpen]);

  // Auto-close NPC dialogue after 8 seconds
  useEffect(() => {
    if (!npcDialogue) return;
    const timer = setTimeout(() => {
      setNpcDialogue(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [npcDialogue]);

  // Handlers
  const handleFastTravel = useCallback((buildingId) => {
    if (worldRef.current && avatarRef.current) {
      const pos = worldRef.current.getBuildingPosition(buildingId);
      if (pos) {
        avatarRef.current.setPosition(pos.x, pos.y + 80);
      }
    }
    setShowMap(false);
  }, []);

  const handleBackToCampus = useCallback(() => {
    if (transitionRef.current) {
      transitionRef.current.exitBuilding();
    }
    setActiveBuilding(null);
    gameContext.exitBuilding();
  }, [gameContext]);

  const handleVolumeChange = useCallback((value) => {
    setAudioVolume(value);
    if (audioRef.current) audioRef.current.setVolume(value);
  }, []);

  const handleMuteToggle = useCallback(() => {
    const newMuted = !audioMuted;
    setAudioMuted(newMuted);
    if (audioRef.current) audioRef.current.setMuted(newMuted);
  }, [audioMuted]);

  const handleAvatarConfirm = useCallback((appearance) => {
    if (avatarRef.current) {
      avatarRef.current.setAppearance(appearance);
    }
    localStorage.setItem('campus_avatar_configured', 'true');
    localStorage.setItem('campus_avatar', JSON.stringify(appearance));
    setShowCustomization(false);

    // Show tutorial if not completed
    const tutorialDone = localStorage.getItem('campus_tutorial_completed') === 'true';
    if (!tutorialDone) {
      setShowTutorial(true);
    }
  }, []);

  const handleTutorialComplete = useCallback(() => {
    localStorage.setItem('campus_tutorial_completed', 'true');
    setShowTutorial(false);
    gameContext.setTutorialCompleted();
  }, [gameContext]);

  const handleTutorialSkip = useCallback(() => {
    localStorage.setItem('campus_tutorial_completed', 'true');
    setShowTutorial(false);
    gameContext.setTutorialCompleted();
  }, [gameContext]);

  const handleEnterBuilding = useCallback((buildingId) => {
    if (transitionRef.current && avatarRef.current) {
      transitionRef.current.enterBuilding(buildingId, avatarRef.current.getPosition());
    } else {
      setActiveBuilding(buildingId);
    }
    setTextNavOpen(false);
  }, [setTextNavOpen]);

  const handleInteractNPC = useCallback((npcId) => {
    if (npcSystemRef.current) {
      const dialogue = npcSystemRef.current.getProgressDialogue(npcId, user.progress);
      const npc = npcSystemRef.current.getNPCById(npcId);
      setNpcDialogue({ npc, text: dialogue });
    }
    setTextNavOpen(false);
  }, [setTextNavOpen, user.progress]);

  const handleActivateQuest = useCallback((questId) => {
    if (questServiceRef.current) {
      const result = questServiceRef.current.activateQuest(questId);
      if (result.success) {
        setActiveQuests(questServiceRef.current.getActiveQuests());
      }
    }
  }, []);

  const handleRetry = useCallback(() => {
    setLoadError(null);
    setLoadProgress(0);
    setLoading(true);
    window.location.reload();
  }, []);

  const handleOrbCollect = useCallback((orbId) => {
    setCollectedOrbs(prev => {
      const next = [...prev, orbId];
      localStorage.setItem('campus_collected_orbs', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleOrbAnswer = useCallback((xp, correct) => {
    if (correct && xp > 0) {
      addXP(xp);
      setXpToast(`+${xp} XP`);
      setTimeout(() => setXpToast(null), 2000);
    }
    setTimeout(() => setShowOrbQuestion(false), correct ? 1500 : 2500);
  }, [addXP]);

  const handleTrivia = useCallback(() => {
    const available = TRIVIA_QUESTIONS.filter(q => !collectedOrbs.includes(q.id));
    if (available.length > 0) {
      setShowOrbQuestion(true);
    }
  }, [collectedOrbs]);

  // Loading state
  if (loading || loadError) {
    return (
      <div className="campus-page">
        <div className="campus-canvas" ref={canvasRef} />
        <LoadingScreen progress={loadProgress} error={loadError} onRetry={handleRetry} />
      </div>
    );
  }

  return (
    <div className="campus-page">
      {/* PixiJS Canvas */}
      <div className="campus-canvas" ref={canvasRef} />

      {/* Interaction prompt */}
      {interactionPrompt && (
        <div className="campus-interaction-prompt" role="status" aria-live="polite">
          <span className="campus-interaction-prompt__icon">{interactionPrompt.icon || '🏢'}</span>
          <span className="campus-interaction-prompt__text">
            Press <kbd>E</kbd> to enter {interactionPrompt.label}
          </span>
        </div>
      )}

      {/* Waypoint Indicator */}
      {waypoint && (
        <WaypointIndicator waypoint={waypoint} playerPosition={gameContext.playerPosition || avatarRef.current?.getPosition()} onClear={() => setWaypoint(null)} />
      )}

      {/* Login Streak Notification */}
      {streakNotification && (
        <div className="campus-streak-notification">
          <span className="campus-streak-notification__text">{streakNotification.message}</span>
        </div>
      )}

      {/* Knowledge Orbs / Trivia */}
      {showOrbQuestion && (
        <KnowledgeOrbs
          collectedOrbs={collectedOrbs}
          onCollectOrb={handleOrbCollect}
          onAnswer={handleOrbAnswer}
        />
      )}

      {/* XP Toast */}
      {xpToast && (
        <div className="campus-xp-toast">{xpToast}</div>
      )}

      {/* NPC Dialogue */}
      {npcDialogue && (
        <div className="campus-npc-dialogue" role="dialog" aria-label={`Dialogue with ${npcDialogue.npc.label}`}>
          <div className="campus-npc-dialogue__header">
            <span className="campus-npc-dialogue__name">{npcDialogue.npc.label}</span>
            <button onClick={() => setNpcDialogue(null)} aria-label="Close dialogue">✕</button>
          </div>
          <p className="campus-npc-dialogue__text">{npcDialogue.text}</p>
        </div>
      )}

      {/* HUD */}
      <CampusHUD
        activeQuests={activeQuests}
        isCompactMode={!!gameContext.activeOverlay}
        onFastTravel={handleFastTravel}
        onBackToCampus={handleBackToCampus}
        audioVolume={audioVolume}
        audioMuted={audioMuted}
        onVolumeChange={handleVolumeChange}
        onMuteToggle={handleMuteToggle}
        xp={user.progress.xp}
        level={user.progress.level}
        xpToNext={user.progress.xpToNext}
      />

      {/* Hotbar */}
      {!activeBuilding && (
        <Hotbar
          onMap={() => setShowMap(true)}
          onQuests={() => setShowQuestLog(true)}
          onProfile={() => setActiveBuilding('student-union')}
          onSettings={() => setShowSettings(true)}
          onTextNav={() => setTextNavOpen(true)}
          onTrivia={handleTrivia}
          badges={{ quests: availableQuestCount, trivia: TRIVIA_QUESTIONS.filter(q => !collectedOrbs.includes(q.id)).length }}
        />
      )}

      {/* Text Navigation */}
      {textNavOpen && (
        <TextNavigation
          onEnterBuilding={handleEnterBuilding}
          onInteractNPC={handleInteractNPC}
          onClose={() => setTextNavOpen(false)}
        />
      )}

      {/* NPC Interaction Prompt */}
      {!interactionPrompt && nearbyNPC && !npcDialogue && (
        <div className="campus-interaction-prompt" role="status" aria-live="polite">
          <span className="campus-interaction-prompt__icon">💬</span>
          <span className="campus-interaction-prompt__text">
            Press <kbd>E</kbd> to talk to {nearbyNPC.label}
          </span>
        </div>
      )}

      {/* Settings overlay */}
      {showSettings && (
        <div className="campus-feature-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div className="campus-feature-overlay__panel" style={{ maxWidth: 400 }}>
            <div className="campus-feature-overlay__header">
              <button className="campus-feature-overlay__back" onClick={() => setShowSettings(false)}>← Close</button>
              <span className="campus-feature-overlay__title">⚙️ Settings</span>
            </div>
            <div className="campus-feature-overlay__content" style={{ padding: 24 }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ color: '#fff', display: 'block', marginBottom: 8, fontSize: 14 }}>Volume</label>
                <input type="range" min="0" max="100" value={audioVolume} onChange={(e) => handleVolumeChange(Number(e.target.value))} style={{ width: '100%' }} />
                <span style={{ color: '#aaa', fontSize: 12 }}>{audioVolume}%</span>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={audioMuted} onChange={() => handleMuteToggle()} />
                  Mute Audio
                </label>
              </div>
              <div>
                <p style={{ color: '#666', fontSize: 12, margin: 0 }}>Keyboard shortcuts: WASD/Arrows = Move, E = Interact, M = Map, Q = Quests, Alt+T = Text Nav</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Map overlay */}
      {showMap && (
        <CampusMap
          onFastTravel={handleFastTravel}
          onClose={() => setShowMap(false)}
          onSetWaypoint={(building) => setWaypoint({ id: building.id, label: building.label, position: building.position })}
        />
      )}

      {/* Quest Log */}
      {showQuestLog && (
        <QuestLog
          activeQuests={activeQuests}
          completedQuests={completedQuests}
          onClose={() => setShowQuestLog(false)}
          onActivateQuest={handleActivateQuest}
        />
      )}

      {/* Avatar Customization */}
      {showCustomization && (
        <AvatarCustomization
          isInitialSetup={true}
          playerLevel={gameContext.playerLevel}
          onConfirm={handleAvatarConfirm}
        />
      )}

      {/* Tutorial */}
      {showTutorial && (
        <Tutorial
          onComplete={handleTutorialComplete}
          onSkip={handleTutorialSkip}
        />
      )}

      {/* Feature overlay - modal panel over dimmed campus */}
      {activeBuilding && (
        <div className="campus-feature-overlay" onClick={(e) => { if (e.target === e.currentTarget) handleBackToCampus(); }}>
          <div className="campus-feature-overlay__panel">
            <div className="campus-feature-overlay__header">
              <button className="campus-feature-overlay__back" onClick={handleBackToCampus}>
                ← Campus
              </button>
              <span className="campus-feature-overlay__title">
                {getBuildingLabel(activeBuilding)}
              </span>
            </div>
            <div className="campus-feature-overlay__content">
              <Suspense fallback={<div className="campus-feature-overlay__loading">Loading...</div>}>
                {renderFeatureContent(activeBuilding)}
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getBuildingLabel(buildingId) {
  const labels = {
    'market-observatory': '🔭 Market Observatory',
    'interview-hall': '🎤 Interview Hall',
    'skill-forge': '🔨 Skill Forge',
    'student-union': '🏛️ Student Union',
    'software-engineering': '💻 Software Engineering Lab',
    'data-science': '📊 Data Science Center',
    'cybersecurity': '🔒 Cybersecurity Fortress',
    'mechanical-engineering': '⚙️ Mechanical Workshop',
    'electrical-engineering': '⚡ Circuits Laboratory',
    'environmental-science': '🌿 Green Research Center',
    'biomedical-engineering': '🧬 Biomedical Innovation Lab',
    'healthcare-tech': '🏥 HealthTech Pavilion',
    'ux-design': '🎨 UX Design Studio',
  };
  return labels[buildingId] || buildingId;
}

function renderFeatureContent(buildingId) {
  switch (buildingId) {
    case 'market-observatory':
      return <ModalMarketObservatory />;
    case 'interview-hall':
      return <ModalInterviewHall />;
    case 'skill-forge':
      return <SkillBridge />;
    case 'student-union':
      return <ModalStudentUnion />;
    case 'software-engineering':
    case 'data-science':
    case 'cybersecurity':
    case 'mechanical-engineering':
    case 'electrical-engineering':
    case 'environmental-science':
    case 'biomedical-engineering':
    case 'healthcare-tech':
    case 'ux-design':
      return <ModalCareerSimulation buildingId={buildingId} />;
    default:
      return <div style={{ color: '#fff', textAlign: 'center', padding: '40px' }}>
        <h2>🏗️ Coming Soon</h2>
        <p>This building is under construction.</p>
      </div>;
  }
}

// Interview Hall — sub-navigation managed by state
function ModalInterviewHall() {
  const [view, setView] = useState('hub');

  if (view === 'mock') return (
    <div>
      <button className="modal-sub-back" onClick={() => setView('hub')}>← Back to Interview Hall</button>
      <MockInterview />
    </div>
  );
  if (view === 'resume') return (
    <div>
      <button className="modal-sub-back" onClick={() => setView('hub')}>← Back to Interview Hall</button>
      <ResumeTailor />
    </div>
  );
  if (view === 'technical') return (
    <div>
      <button className="modal-sub-back" onClick={() => setView('hub')}>← Back to Interview Hall</button>
      <TechnicalAssessment />
    </div>
  );

  return (
    <div className="modal-hub-grid">
      <h2 style={{ color: '#fff', margin: '20px 24px 12px' }}>🎤 Interview Hall</h2>
      <p style={{ color: '#aaa', margin: '0 24px 20px', fontSize: 14 }}>Practice interviews, polish your resume, and ace technical assessments.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, padding: '0 24px 24px' }}>
        <button className="modal-hub-card" onClick={() => setView('mock')}>
          <span style={{ fontSize: 28 }}>🗣️</span>
          <strong>AI Mock Interview</strong>
          <span style={{ fontSize: 12, color: '#aaa' }}>Practice with AI interviewer</span>
        </button>
        <button className="modal-hub-card" onClick={() => setView('resume')}>
          <span style={{ fontSize: 28 }}>📄</span>
          <strong>Resume Tailor</strong>
          <span style={{ fontSize: 12, color: '#aaa' }}>Analyze & improve your resume</span>
        </button>
        <button className="modal-hub-card" onClick={() => setView('technical')}>
          <span style={{ fontSize: 28 }}>💻</span>
          <strong>Technical Assessment</strong>
          <span style={{ fontSize: 12, color: '#aaa' }}>Test your coding skills</span>
        </button>
      </div>
    </div>
  );
}

// Market Observatory
function ModalMarketObservatory() {
  const [Provider, setProvider] = useState(null);

  useEffect(() => {
    import('../context/MarketIntelligenceContext').then(m => {
      setProvider(() => m.MarketIntelligenceProvider);
    });
  }, []);

  if (!Provider) return <div className="campus-feature-overlay__loading">Loading...</div>;

  return (
    <Provider>
      <MarketIntelligence />
    </Provider>
  );
}

// Student Union
function ModalStudentUnion() {
  const [view, setView] = useState('menu');

  if (view === 'leaderboard') return (
    <div>
      <button className="modal-sub-back" onClick={() => setView('menu')}>← Back</button>
      <Leaderboard />
    </div>
  );
  if (view === 'profile') return (
    <div>
      <button className="modal-sub-back" onClick={() => setView('menu')}>← Back</button>
      <Profile />
    </div>
  );
  if (view === 'role-models') return (
    <div>
      <button className="modal-sub-back" onClick={() => setView('menu')}>← Back</button>
      <RoleModels />
    </div>
  );

  return (
    <div className="modal-hub-grid">
      <h2 style={{ color: '#fff', margin: '20px 24px 12px' }}>🏛️ Student Union</h2>
      <p style={{ color: '#aaa', margin: '0 24px 20px', fontSize: 14 }}>Your community hub for rankings, profile, and mentors.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, padding: '0 24px 24px' }}>
        <button className="modal-hub-card" onClick={() => setView('leaderboard')}>
          <span style={{ fontSize: 28 }}>🏆</span>
          <strong>Leaderboard</strong>
          <span style={{ fontSize: 12, color: '#aaa' }}>See top achievers</span>
        </button>
        <button className="modal-hub-card" onClick={() => setView('profile')}>
          <span style={{ fontSize: 28 }}>👤</span>
          <strong>My Profile</strong>
          <span style={{ fontSize: 12, color: '#aaa' }}>Badges & progress</span>
        </button>
        <button className="modal-hub-card" onClick={() => setView('role-models')}>
          <span style={{ fontSize: 28 }}>⭐</span>
          <strong>Role Models</strong>
          <span style={{ fontSize: 12, color: '#aaa' }}>Find STEM mentors</span>
        </button>
      </div>
    </div>
  );
}

export default Campus;
