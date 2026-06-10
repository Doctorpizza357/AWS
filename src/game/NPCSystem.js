/**
 * NPCSystem - Manages NPC rendering, interaction, dialogue, and quest indicators.
 */
import EventBus, { GameEvents } from './EventBus';
import campusConfig from '../data/campusConfig.json';

class NPCSystem {
  constructor() {
    this._eventBus = EventBus.getInstance();
    this._npcs = campusConfig.npcs;
    this._questIndicators = new Map(); // npcId → boolean
  }

  get npcs() {
    return this._npcs;
  }

  /**
   * Get NPC by ID.
   */
  getNPCById(npcId) {
    return this._npcs.find(n => n.id === npcId) || null;
  }

  /**
   * Check if player is in range of any NPC.
   */
  checkProximity(playerPos) {
    const INTERACTION_RADIUS = 64;
    for (const npc of this._npcs) {
      const dx = playerPos.x - npc.position.x;
      const dy = playerPos.y - npc.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= INTERACTION_RADIUS) {
        return npc;
      }
    }
    return null;
  }

  /**
   * Build the prompt for Bedrock AI with profile data.
   */
  buildNPCPrompt(npc, profile = {}) {
    let prompt = `You are ${npc.label}, an NPC advisor at STEM PathfindR Campus. `;
    prompt += `Your topic area is: ${npc.topic}. `;
    prompt += `Your location: ${npc.zone ? `${npc.zone} zone` : 'campus entrance'}. `;
    prompt += `Provide friendly, encouraging career guidance. `;

    // Include profile attributes when available
    const profileAttributes = [];
    if (profile.completedSimulations && profile.completedSimulations.length > 0) {
      profileAttributes.push(`completed simulations: ${profile.completedSimulations.join(', ')}`);
    }
    if (profile.xpLevel) {
      profileAttributes.push(`current level: ${profile.xpLevel}`);
    }
    if (profile.careerInterests && profile.careerInterests.length > 0) {
      profileAttributes.push(`career interests: ${profile.careerInterests.join(', ')}`);
    }

    if (profileAttributes.length > 0) {
      prompt += `\n\nStudent profile data: ${profileAttributes.join('; ')}. `;
      prompt += `Reference at least one of these attributes in your response. `;
    } else {
      prompt += `\n\nThis student is new. Provide introductory guidance for your location. `;
    }

    prompt += `\nKeep response under 150 words. Be encouraging and game-themed.`;
    return prompt;
  }

  /**
   * Get dialogue for an NPC (fallback when AI unavailable).
   */
  getFallbackDialogue(npcId) {
    const npc = this.getNPCById(npcId);
    return npc ? npc.fallbackDialogue : 'Hello! Welcome to campus.';
  }

  /**
   * Get progress-aware dialogue for an NPC.
   */
  getProgressDialogue(npcId, userProgress = {}) {
    const npc = this.getNPCById(npcId);
    if (!npc) return 'Hello!';

    const completedSims = userProgress.completedScenarios || [];
    const level = userProgress.level || 1;
    const badges = userProgress.badges || [];

    // Build context-aware response
    const templates = this._getDialogueTemplates(npc, completedSims, level, badges);
    return templates[Math.floor(Math.random() * templates.length)];
  }

  _getDialogueTemplates(npc, completedSims, level, badges) {
    const hasAnySims = completedSims.length > 0;
    const isHighLevel = level >= 5;
    const hasBadges = badges.length > 0;

    const base = [npc.fallbackDialogue];

    if (npc.topic === 'general') {
      if (isHighLevel) base.push(`Level ${level}! You're really making progress. Have you explored all the zones yet?`);
      if (hasAnySims) base.push(`I see you've completed ${completedSims.length} simulation${completedSims.length > 1 ? 's' : ''}! Keep going — each one builds real skills.`);
      if (!hasAnySims) base.push("You haven't tried any simulations yet! I'd recommend starting at the Tech Hub — the Software Engineering Lab is great for beginners.");
    }

    if (npc.topic === 'technology') {
      if (completedSims.some(s => s.startsWith('se-'))) base.push("Nice work on the Software Engineering scenarios! Ready for Data Science? It's right next door.");
      if (!hasAnySims) base.push("The Tech Hub has three labs — Software Engineering, Data Science, and Cybersecurity. Each one has unique challenges waiting for you!");
      if (isHighLevel) base.push("At your level, you should try the Cybersecurity Fortress. The challenges there are intense but rewarding.");
    }

    if (npc.topic === 'engineering') {
      if (hasAnySims && level >= 3) base.push("You've got the skills for advanced engineering scenarios. The Mechanical Workshop has some tough design challenges.");
      if (!hasAnySims) base.push("Engineering is about solving real problems. Try the Circuits Laboratory — you'll design actual circuit solutions!");
    }

    if (npc.topic === 'interviews') {
      if (hasBadges) base.push(`With ${badges.length} badge${badges.length > 1 ? 's' : ''} under your belt, you'll crush any interview. Want to practice?`);
      if (level >= 3) base.push("At your level, I'd recommend trying the Technical Assessment. Companies love candidates who can code under pressure.");
      base.push("Pro tip: Do a mock interview first, then tailor your resume, then attempt the technical assessment. That's the winning order!");
    }

    if (npc.topic === 'community') {
      if (isHighLevel) base.push(`Level ${level}! You must be on the leaderboard by now. Check it out in the Student Union!`);
      if (hasBadges) base.push("Nice badge collection! Each one shows employers you've put in real work. View them all in your profile.");
      base.push("The Student Union has everything — leaderboards, profiles, badges, and role models. Connect with mentors who've walked your path!");
    }

    return base;
  }

  /**
   * Set quest availability indicator on nearest NPC.
   */
  setQuestIndicator(npcId, hasQuest) {
    this._questIndicators.set(npcId, hasQuest);
    if (hasQuest) {
      this._eventBus.emit(GameEvents.NPC_QUEST_AVAILABLE, { npcId });
    }
  }

  /**
   * Get whether an NPC has a quest indicator.
   */
  hasQuestIndicator(npcId) {
    return this._questIndicators.get(npcId) || false;
  }

  /**
   * Find the nearest NPC to a given position.
   */
  findNearestNPC(position) {
    let nearest = null;
    let minDist = Infinity;

    for (const npc of this._npcs) {
      const dx = position.x - npc.position.x;
      const dy = position.y - npc.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        nearest = npc;
      }
    }

    return nearest;
  }

  /**
   * Given a quest location, find the nearest NPC and set its indicator.
   */
  assignQuestIndicatorToNearest(questLocation) {
    const nearest = this.findNearestNPC(questLocation);
    if (nearest) {
      this.setQuestIndicator(nearest.id, true);
      return nearest.id;
    }
    return null;
  }

  /**
   * Clear all quest indicators.
   */
  clearAllIndicators() {
    this._questIndicators.clear();
  }
}

export default NPCSystem;
