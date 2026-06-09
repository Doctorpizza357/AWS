/**
 * Quest Service - Manages quest lifecycle, validation, XP awards, and badges.
 */
import questsData from '../data/quests.json';
import EventBus, { GameEvents } from '../game/EventBus';

const QUEST_TYPES = {
  EXPLORATION: 'exploration',
  SKILL: 'skill',
  MASTERY: 'mastery',
};

const XP_RANGES = {
  exploration: { min: 50, max: 100 },
  skill: { min: 100, max: 300 },
  mastery: { min: 200, max: 500 },
};

const MAX_ACTIVE_QUESTS = 3;

class QuestService {
  constructor() {
    this._quests = questsData;
    this._activeQuests = [];
    this._completedQuests = [];
    this._eventBus = EventBus.getInstance();
  }

  /**
   * Get all quests available to this profile (prerequisites met, not completed, not active).
   */
  getAvailableQuests(profile = {}) {
    const completedIds = new Set(this._completedQuests.map(q => q.questId || q.id));
    const activeIds = new Set(this._activeQuests.map(q => q.questId || q.id));

    return this._quests.filter(quest => {
      if (completedIds.has(quest.id)) return false;
      if (activeIds.has(quest.id)) return false;
      if (quest.prerequisite && !completedIds.has(quest.prerequisite)) return false;
      return true;
    });
  }

  /**
   * Get currently active quests (max 3).
   */
  getActiveQuests() {
    return this._activeQuests.slice(0, MAX_ACTIVE_QUESTS);
  }

  /**
   * Get completed quest history.
   */
  getCompletedQuests() {
    return [...this._completedQuests];
  }

  /**
   * Activate a quest (add to active list if under limit).
   */
  activateQuest(questId) {
    if (this._activeQuests.length >= MAX_ACTIVE_QUESTS) {
      return { success: false, reason: 'max_active_reached' };
    }

    const quest = this._quests.find(q => q.id === questId);
    if (!quest) return { success: false, reason: 'quest_not_found' };

    // Check prerequisites
    const completedIds = new Set(this._completedQuests.map(q => q.questId || q.id));
    if (quest.prerequisite && !completedIds.has(quest.prerequisite)) {
      return { success: false, reason: 'prerequisite_not_met' };
    }

    // Check not already active
    if (this._activeQuests.find(q => (q.questId || q.id) === questId)) {
      return { success: false, reason: 'already_active' };
    }

    const activeQuest = {
      questId: quest.id,
      activatedAt: new Date().toISOString(),
      completedTasks: [],
    };

    this._activeQuests.push(activeQuest);
    this._eventBus.emit(GameEvents.QUEST_ACTIVATED, { quest, activeQuest });
    return { success: true, activeQuest };
  }

  /**
   * Complete a task within an active quest.
   */
  completeTask(questId, taskId) {
    const activeQuest = this._activeQuests.find(q => (q.questId || q.id) === questId);
    if (!activeQuest) return { success: false, reason: 'quest_not_active' };

    const quest = this._quests.find(q => q.id === questId);
    if (!quest) return { success: false, reason: 'quest_not_found' };

    const task = quest.tasks.find(t => t.id === taskId);
    if (!task) return { success: false, reason: 'task_not_found' };

    if (activeQuest.completedTasks.includes(taskId)) {
      return { success: false, reason: 'task_already_completed' };
    }

    activeQuest.completedTasks.push(taskId);
    this._eventBus.emit(GameEvents.QUEST_TASK_COMPLETED, { questId, taskId });

    // Check if all tasks complete
    if (activeQuest.completedTasks.length === quest.tasks.length) {
      return this.completeQuest(questId);
    }

    return { success: true, progress: activeQuest.completedTasks.length, total: quest.tasks.length };
  }

  /**
   * Complete a quest - award XP and badge.
   */
  completeQuest(questId) {
    const quest = this._quests.find(q => q.id === questId);
    if (!quest) return { success: false, reason: 'quest_not_found' };

    // Remove from active
    this._activeQuests = this._activeQuests.filter(q => (q.questId || q.id) !== questId);

    // Calculate XP
    const xp = this.calculateXPReward(quest);

    // Add to completed
    const completed = {
      questId: quest.id,
      id: quest.id,
      completedAt: new Date().toISOString(),
      xpAwarded: xp,
      badgeAwarded: quest.type === QUEST_TYPES.MASTERY ? quest.badgeReward : null,
    };
    this._completedQuests.push(completed);

    // Emit events
    this._eventBus.emit(GameEvents.XP_AWARDED, { xp, questId });
    this._eventBus.emit(GameEvents.QUEST_COMPLETED, {
      quest,
      xp,
      badge: completed.badgeAwarded,
    });

    return { success: true, xp, badge: completed.badgeAwarded };
  }

  /**
   * Validate quest structure against requirements.
   */
  validateQuestStructure(quest) {
    const errors = [];

    if (!quest.title || quest.title.length > 60) {
      errors.push('Title must be between 1 and 60 characters');
    }
    if (!quest.description || quest.description.length > 200) {
      errors.push('Description must be between 1 and 200 characters');
    }
    if (!quest.tasks || quest.tasks.length < 1 || quest.tasks.length > 6) {
      errors.push('Tasks must be between 1 and 6');
    }
    if (!Object.values(QUEST_TYPES).includes(quest.type)) {
      errors.push('Invalid quest type');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Calculate XP reward based on quest type.
   */
  calculateXPReward(quest) {
    const range = XP_RANGES[quest.type];
    if (!range) return 0;

    const reward = quest.xpReward || range.min;
    // Clamp to valid range
    return Math.max(range.min, Math.min(range.max, reward));
  }

  /**
   * Mark a task as temporarily locked (service unavailable).
   */
  lockTask(questId, taskId) {
    const activeQuest = this._activeQuests.find(q => (q.questId || q.id) === questId);
    if (!activeQuest) return;
    if (!activeQuest.lockedTasks) activeQuest.lockedTasks = [];
    if (!activeQuest.lockedTasks.includes(taskId)) {
      activeQuest.lockedTasks.push(taskId);
    }
  }

  unlockTask(questId, taskId) {
    const activeQuest = this._activeQuests.find(q => (q.questId || q.id) === questId);
    if (!activeQuest || !activeQuest.lockedTasks) return;
    activeQuest.lockedTasks = activeQuest.lockedTasks.filter(id => id !== taskId);
  }

  /**
   * Get all quests organized by career zone.
   */
  getQuestsByZone() {
    const byZone = {};
    for (const quest of this._quests) {
      if (!byZone[quest.careerZone]) byZone[quest.careerZone] = [];
      byZone[quest.careerZone].push(quest);
    }
    return byZone;
  }

  /**
   * Restore state from persisted data.
   */
  restoreState(state) {
    if (state.activeQuests) this._activeQuests = state.activeQuests;
    if (state.completedQuests) this._completedQuests = state.completedQuests;
  }

  /**
   * Get serializable state for persistence.
   */
  getState() {
    return {
      activeQuests: this._activeQuests,
      completedQuests: this._completedQuests,
    };
  }
}

export { QUEST_TYPES, XP_RANGES, MAX_ACTIVE_QUESTS };
export default QuestService;
