/**
 * Trait → Skill map for SkillBridge AI inferred-gain logic (Requirement 5.5).
 *
 * Format
 * ------
 * Default export: a plain object.
 *   - Keys are trait strings emitted by Simulation.js scenario options
 *     (`option.traits[i]`). Both the AI scenario generator and the curated
 *     fallback scenarios in `src/services/aiService.js` use the same flat
 *     vocabulary of lowercase-hyphenated trait names.
 *   - Values are arrays of zero or more `skillId` strings. Every `skillId`
 *     here MUST exist in the active SkillBridge skill universe — that is,
 *     either as a `skillId` in the curated catalog at
 *     `src/data/projects.js` or as the kebab-case form of a skill in the
 *     `skills` array of an entry in `src/data/careers.js`.
 *
 * Semantics
 * ---------
 * The map is consumed by `applyTraitGains(...)` in
 * `src/services/skillbridgeService.js`. For each trait emitted by the
 * chosen Simulation option, every `skillId` in the array is considered;
 * if that `skillId` is also in the user's *active* Skill_Requirements
 * set, the user's `currentLevel` for that skill is increased by
 * `floor(rewardXp / 4)` and clamped to `[0, 100]`. SkillIds that are not
 * in the active set are silently ignored (Requirement 5.3), so listing
 * extra mappings here is safe and forward-compatible with new careers.
 *
 * Conventions
 * -----------
 * - All trait keys are lowercase. Multi-word traits use a single hyphen
 *   (e.g. `learning-oriented`, `action-oriented`).
 * - All skillId values are kebab-case to match the Bedrock requirements
 *   prompt (`skillId is kebab-case`, see `design.md`) and the kebab-case
 *   form of `careers.js.skills` entries.
 * - An empty array (`[]`) means "this trait exists but has no skill
 *   mapping yet"; it is preserved deliberately so the trait stays
 *   documented and the runtime treats it as a no-op.
 * - When adding a new trait, also add it here (even if mapped to `[]`)
 *   so behavior stays deterministic across releases.
 */
const skillTraitMap = {
  // Team-oriented traits: emphasize collaboration and communication skills.
  collaborative: ['collaboration', 'communication'],
  helpful: ['collaboration', 'communication'],
  independent: ['problem-solving'],
  efficient: ['problem-solving', 'cost-optimization'],

  // Strategy / leadership traits: tied to system-level thinking and policy work.
  strategic: ['system-design', 'policy', 'cost-optimization'],
  leadership: ['collaboration', 'communication'],

  // Analytical / technical traits: tied to research, data, and engineering skills.
  analytical: ['data-analysis', 'statistics', 'research'],
  technical: ['programming', 'engineering', 'system-design'],
  scientific: ['research', 'statistics', 'data-analysis'],
  thorough: ['research', 'data-analysis'],
  methodical: ['research', 'modeling'],
  organized: ['system-design', 'modeling'],
  pragmatic: ['system-design', 'problem-solving'],
  experienced: ['system-design', 'problem-solving'],
  prepared: ['research', 'communication'],
  'learning-oriented': ['research'],
  humble: ['collaboration', 'communication'],
  confident: ['communication'],
  adaptable: ['problem-solving', 'collaboration'],

  // Decision-making traits: most relevant to security / response work.
  decisive: ['incident-response', 'threat-analysis'],
  cautious: ['threat-analysis', 'incident-response'],

  // Creative / innovative traits: tied to design and engineering work.
  creative: ['engineering', 'mechanical-design'],
  innovative: ['engineering', 'research'],
  'action-oriented': ['programming', 'problem-solving'],
};

export default skillTraitMap;
