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
