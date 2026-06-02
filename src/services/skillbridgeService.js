// SkillBridge service layer.
//
// Pure helpers used by SkillBridgeContext, the SkillBridge UI, and the property
// based tests in skillbridgeService.test.js. Functions here MUST stay pure (no
// Date.now, no Math.random, no I/O) so they can be reasoned about with
// fast-check.

import { arrayUnion, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Coerces an arbitrary input to an integer in the inclusive range [0, 100].
 *
 * Behavior (see design.md, Requirements 3.5 and 4.3):
 *   1. `''`, `null`, `undefined`, or any non-number value -> `0`
 *   2. A finite number -> `Math.round(value)` clamped to `[0, 100]`
 *   3. Anything else (NaN, Infinity, -Infinity) -> `0`
 *
 * @param {unknown} value
 * @returns {number} integer in [0, 100]
 */
export function clampLevel(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round(value);
  if (rounded < 0) return 0;
  if (rounded > 100) return 100;
  return rounded;
}

/**
 * Strict validator for a persisted Skill_Assessment shape.
 *
 * Returns the same `a` reference iff every documented invariant holds; returns
 * `null` otherwise. The save path in `SkillBridgeContext.saveAssessment` MUST
 * refuse to persist a `null` result so that no out-of-range or non-integer
 * level can ever reach Firestore (Requirements 3.6, 4.4).
 *
 * Invariants:
 *   - `a` is a plain object (not null, not an array, not a primitive).
 *   - `a.updatedAt` is a string (any string; ISO-8601 enforcement lives at the
 *     write call site).
 *   - `a.skills` is a plain object whose every own enumerable value is an
 *     integer in the inclusive range `[0, 100]`.
 *
 * The function is pure and does not mutate `a`. When it returns non-null, the
 * return value is `a` itself, preserving reference identity so callers can
 * detect a successful validation with a `===` check.
 *
 * @param {unknown} a candidate Skill_Assessment
 * @returns {object|null} `a` on success, `null` on any violation
 */
export function validateAssessment(a) {
  if (!isPlainObject(a)) return null;
  if (typeof a.updatedAt !== 'string') return null;
  if (!isPlainObject(a.skills)) return null;

  for (const value of Object.values(a.skills)) {
    if (!Number.isInteger(value)) return null;
    if (value < 0 || value > 100) return null;
  }

  return a;
}

// Difficulty rank for sortProjectsForPhase. Lower is "easier" and sorts first.
// Unknown / missing difficulties are treated as the largest rank so they sort
// to the end after all known difficulties.
const DIFFICULTY_RANK = { easy: 0, medium: 1, hard: 2 };

function difficultyRank(d) {
  return Object.prototype.hasOwnProperty.call(DIFFICULTY_RANK, d)
    ? DIFFICULTY_RANK[d]
    : Number.POSITIVE_INFINITY;
}

function focusOverlapCount(project, focusSet) {
  if (!project || !Array.isArray(project.skills)) return 0;
  // Treat skills and focusSkills as sets so duplicates do not inflate the
  // overlap count (matches the "project.skills ∩ focusSkills" set semantics
  // documented in design.md).
  const seen = new Set();
  let count = 0;
  for (const skill of project.skills) {
    if (seen.has(skill)) continue;
    seen.add(skill);
    if (focusSet.has(skill)) count += 1;
  }
  return count;
}

/**
 * Sorts a candidate Project list deterministically for a given Phase.
 *
 * Ordering (see design.md Property 8 / Requirements 10.2, 10.6, 10.7):
 *   1. Greater overlap of `project.skills ∩ focusSkills` first (count desc).
 *   2. Ties broken by difficulty ascending: easy < medium < hard. Unknown
 *      difficulty strings sort to the end.
 *   3. Final ties broken by `id` ascending (string compare).
 *
 * The function is pure and does not mutate the input. The output is a
 * permutation of the input (same elements, same length). Because every tier
 * including the final `id` tiebreaker is total over distinct ids, the result
 * is independent of the input order.
 *
 * @param {Array} candidates project objects (may include unknown shapes)
 * @param {Array<string>} focusSkills active phase focus skills
 * @returns {Array} the sorted permutation of `candidates`
 */
export function sortProjectsForPhase(candidates, focusSkills) {
  const input = Array.isArray(candidates) ? candidates : [];
  const focusSet = new Set(Array.isArray(focusSkills) ? focusSkills : []);

  return input.slice().sort((a, b) => {
    const oa = focusOverlapCount(a, focusSet);
    const ob = focusOverlapCount(b, focusSet);
    if (oa !== ob) return ob - oa; // overlap desc

    const da = difficultyRank(a && a.difficulty);
    const db = difficultyRank(b && b.difficulty);
    if (da !== db) return da - db; // difficulty asc

    const ia = a && a.id != null ? String(a.id) : '';
    const ib = b && b.id != null ? String(b.id) : '';
    if (ia < ib) return -1;
    if (ia > ib) return 1;
    return 0;
  });
}

// ─── Response validators (Task 13) ──────────────────────────────────────────
//
// Pure structural validators for the four `/api/skillbridge/*` JSON payloads.
// Each function returns a boolean and mirrors the server-side counterparts in
// `server/index.js` so the client can independently re-validate every Bedrock
// response before storing or rendering it (Reqs 2.2, 2.3, 2.6, 8.2–8.5,
// 10.4–10.5).

const SKILLBRIDGE_DIFFICULTIES = ['easy', 'medium', 'hard'];

// ISO-8601 with seconds, optional fractional seconds, and a Z or ±HH:MM offset.
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringWithLen(value, minLen, maxLen) {
  return typeof value === 'string' && value.length >= minLen && value.length <= maxLen;
}

function isNonEmptyString(value, maxLen = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'string' && value.length >= 1 && value.length <= maxLen;
}

function isIntegerInRange(value, min, max) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isFiniteNumberInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isIso8601String(value) {
  if (typeof value !== 'string' || !ISO_8601_REGEX.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

/**
 * Validates a `POST /api/skillbridge/requirements` response payload.
 *
 * Accepts only:
 *   - `payload.ok === true`
 *   - `payload.requirements` is an array of length [5, 15]
 *   - every entry has:
 *       skillId  : non-empty string of length ≤ 64
 *       name     : non-empty string of length ≤ 120
 *       rationale: string of length ≤ 500
 *       targetLevel: integer in [0, 100]
 *       weight   : finite number in [0, 1]
 *
 * @param {unknown} payload
 * @returns {boolean}
 */
export function validateRequirementsResponse(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.ok !== true) return false;
  if (!Array.isArray(payload.requirements)) return false;
  if (payload.requirements.length < 5 || payload.requirements.length > 15) return false;

  for (const requirement of payload.requirements) {
    if (!isPlainObject(requirement)) return false;
    if (!isStringWithLen(requirement.skillId, 1, 64)) return false;
    if (!isStringWithLen(requirement.name, 1, 120)) return false;
    if (typeof requirement.rationale !== 'string' || requirement.rationale.length > 500) return false;
    if (!isIntegerInRange(requirement.targetLevel, 0, 100)) return false;
    if (!isFiniteNumberInRange(requirement.weight, 0, 1)) return false;
  }

  return true;
}

/**
 * Validates a `POST /api/skillbridge/roadmap` response payload.
 *
 * Accepts only:
 *   - `payload.ok === true`
 *   - `payload.roadmap` is an object with:
 *       id          : non-empty string (≤ 256 chars)
 *       dreamJobId  : non-empty string (≤ 128 chars)
 *       generatedAt : ISO-8601 string parseable by Date.parse
 *       phases      : array of length [3, 6]
 *   - every phase has:
 *       weekStart  : positive integer
 *       weekEnd    : positive integer with weekStart ≤ weekEnd
 *       projectIds : array of length [1, 3]
 *
 * @param {unknown} payload
 * @returns {boolean}
 */
export function validateRoadmapResponse(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.ok !== true) return false;

  const roadmap = payload.roadmap;
  if (!isPlainObject(roadmap)) return false;
  if (!isNonEmptyString(roadmap.id, 256)) return false;
  if (!isNonEmptyString(roadmap.dreamJobId, 128)) return false;
  if (!isIso8601String(roadmap.generatedAt)) return false;
  if (!Array.isArray(roadmap.phases)) return false;
  if (roadmap.phases.length < 3 || roadmap.phases.length > 6) return false;

  for (const phase of roadmap.phases) {
    if (!isPlainObject(phase)) return false;
    if (!isIntegerInRange(phase.weekStart, 1, Number.MAX_SAFE_INTEGER)) return false;
    if (!isIntegerInRange(phase.weekEnd, 1, Number.MAX_SAFE_INTEGER)) return false;
    if (phase.weekStart > phase.weekEnd) return false;
    if (!Array.isArray(phase.projectIds)) return false;
    if (phase.projectIds.length < 1 || phase.projectIds.length > 3) return false;
  }

  return true;
}

function isValidProjectShape(project) {
  if (!isPlainObject(project)) return false;
  if (!isNonEmptyString(project.id)) return false;
  if (!Array.isArray(project.careerIds)) return false;
  if (!Array.isArray(project.skills)) return false;
  if (!SKILLBRIDGE_DIFFICULTIES.includes(project.difficulty)) return false;
  if (!isNonEmptyString(project.title)) return false;
  if (typeof project.summary !== 'string') return false;
  if (!Array.isArray(project.deliverables)) return false;
  if (project.deliverables.length < 1 || project.deliverables.length > 10) return false;
  if (!isIntegerInRange(project.estHours, 1, 200)) return false;
  return true;
}

/**
 * Validates a `POST /api/skillbridge/projects` response payload.
 *
 * Accepts only:
 *   - `payload.ok === true`
 *   - `payload.projects` is an array of length [1, 5]
 *   - every entry conforms to the catalog shape
 *     `{ id, careerIds, skills, difficulty, title, summary, deliverables, estHours }`
 *     where difficulty ∈ {easy, medium, hard}, deliverables length ∈ [1, 10],
 *     and estHours integer ∈ [1, 200].
 *   - every entry has `aiGenerated === true` (Req 10.4).
 *
 * @param {unknown} payload
 * @returns {boolean}
 */
export function validateProjectsResponse(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.ok !== true) return false;
  if (!Array.isArray(payload.projects)) return false;
  if (payload.projects.length < 1 || payload.projects.length > 5) return false;

  for (const project of payload.projects) {
    if (!isValidProjectShape(project)) return false;
    if (project.aiGenerated !== true) return false;
  }

  return true;
}

/**
 * Validates a `POST /api/skillbridge/seed-assessment` response payload.
 *
 * Accepts only:
 *   - `payload.ok === true`
 *   - `payload.levels` is an object whose every value is an integer in [0, 100].
 *
 * @param {unknown} payload
 * @returns {boolean}
 */
export function validateSeedAssessmentResponse(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.ok !== true) return false;
  if (!isPlainObject(payload.levels)) return false;

  for (const value of Object.values(payload.levels)) {
    if (!isIntegerInRange(value, 0, 100)) return false;
  }

  return true;
}

// ─── computeProfileHash (Task 9) ─────────────────────────────────────────────
//
// Deterministic, pure profile hash used as the cache key for SkillBridge
// roadmaps (Requirement 17). The roadmap cache is keyed by
// `(uid, dreamJobId, profileHash)`, so the function MUST be stable across
// `skills`-key insertion order and MUST NOT read `Date.now`, `Math.random`, or
// `crypto.subtle` (Reqs 17.1–17.6).
//
// Algorithm:
//   1. Validate inputs (throw `Invalid profile hash input ...` on any
//      malformed assessment, malformed `skills` map, or empty/missing
//      `dreamJobId`).
//   2. Sort the `skills` map keys lexicographically.
//   3. Concatenate `key=value` pairs joined by U+0001 (SOH).
//   4. Append U+0001 + dreamJobId.
//   5. Run an inline pure JS FNV-1a 32-bit hash, return lowercase 8-char hex.

const FNV_OFFSET_BASIS_32 = 0x811c9dc5; // 2166136261
const FNV_PRIME_32 = 0x01000193; // 16777619
const PROFILE_HASH_DELIMITER = '\u0001';

function fnv1a32Hex(input) {
  // Signed 32-bit accumulator. `Math.imul` keeps the multiplication in
  // 32-bit range; the final `>>> 0` reinterprets the bits as unsigned for
  // hex emission.
  let h = FNV_OFFSET_BASIS_32 | 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME_32);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function isProfileSkillLevel(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

/**
 * Computes the deterministic profile hash for the SkillBridge roadmap cache.
 *
 * Determinism contract (Requirement 17):
 *   - Idempotent under `skills` key reorder and under any non-`skills`
 *     field changes on the assessment (Req 17.2).
 *   - Discriminates on `dreamJobId` (Req 17.3).
 *   - Discriminates on at least one differing `(skillId, level)` pair
 *     (Req 17.5).
 *   - Pure: no `Date.now`, no `Math.random`, no `crypto.subtle` (Req 17.4).
 *   - Output length ∈ [1, 256] (Req 17.1) — FNV-1a 32-bit hex emits 8 chars.
 *
 * @param {object} skillAssessment must be a plain object with a plain-object
 *   `skills` map whose values are integers in [0, 100].
 * @param {string} dreamJobId must be a non-empty string.
 * @returns {string} lowercase 8-char hex digest.
 * @throws {Error} `Invalid profile hash input` on any malformed input
 *   (Req 17.6).
 */
export function computeProfileHash(skillAssessment, dreamJobId) {
  if (!isPlainObject(skillAssessment)) {
    throw new Error('Invalid profile hash input: skillAssessment must be an object');
  }
  if (!isPlainObject(skillAssessment.skills)) {
    throw new Error('Invalid profile hash input: skillAssessment.skills must be an object');
  }
  if (typeof dreamJobId !== 'string' || dreamJobId.length === 0) {
    throw new Error('Invalid profile hash input: dreamJobId must be a non-empty string');
  }

  const skills = skillAssessment.skills;
  const sortedKeys = Object.keys(skills).sort();

  for (const key of sortedKeys) {
    if (!isProfileSkillLevel(skills[key])) {
      throw new Error('Invalid profile hash input: every skills value must be an integer in [0, 100]');
    }
  }

  const parts = sortedKeys.map((key) => `${key}=${skills[key]}`);
  const serialized = parts.join(PROFILE_HASH_DELIMITER) + PROFILE_HASH_DELIMITER + dreamJobId;
  return fnv1a32Hex(serialized);
}

// ─── computeSkillGapList / allGapsClosed (Task 7) ───────────────────────────
//
// Pure derivation of the SkillBridge gap list from the active Skill_Requirement
// set + Skill_Assessment (Requirement 6). The output drives both the radar
// chart and the bar list, the Dashboard summary card, and the Gap Closer
// celebration / badge.
//
// Behavior contract (Reqs 6.1–6.5, 13.6, 20.4):
//   - currentLevel for each requirement = `assessment?.skills?.[skillId]` when
//     that value is an integer in [0, 100], otherwise 0 (Req 6.1). We do NOT
//     run `clampLevel` here because the inputs come from already-validated
//     storage; the safe-integer fallback to 0 is the documented default.
//   - gap = max(0, targetLevel − currentLevel), then clamped to [0, 100] as
//     a defensive bound in case targetLevel is somehow > 100 (Req 6.1).
//   - Every output entry has the documented Skill_Gap shape:
//     { skillId, name, currentLevel, targetLevel, weight, gap }.
//   - Output length always equals `requirements.length`.
//   - Sort: gap desc → weight desc → name case-insensitive asc (Req 6.2).
//
// `allGapsClosed(gapList)` is the predicate used by the Gap Closer
// celebration and badge: returns true iff the gap list contains at least one
// entry and every entry's gap is exactly 0 (Reqs 6.3, 6.5, 13.6, 20.4).

function safeCurrentLevel(assessment, skillId) {
  if (!isPlainObject(assessment)) return 0;
  if (!isPlainObject(assessment.skills)) return 0;
  const value = assessment.skills[skillId];
  if (!Number.isInteger(value)) return 0;
  if (value < 0 || value > 100) return 0;
  return value;
}

/**
 * Computes the ranked Skill_Gap list for a given Skill_Requirement set and
 * Skill_Assessment.
 *
 * Pure: same inputs always produce the same output, no I/O.
 *
 * @param {Array<{skillId: string, name: string, targetLevel: number, weight: number}>} requirements
 * @param {object|null} assessment Skill_Assessment with `skills: { [id]: int }`
 *   or null.
 * @returns {Array<{skillId, name, currentLevel, targetLevel, weight, gap}>}
 *   sorted by gap desc → weight desc → name case-insensitive asc, with
 *   length equal to `requirements.length`.
 */
export function computeSkillGapList(requirements, assessment) {
  const reqs = Array.isArray(requirements) ? requirements : [];

  const entries = reqs.map((req) => {
    const skillId = req && req.skillId;
    const name = req && typeof req.name === 'string' ? req.name : '';
    const targetLevel =
      req && Number.isInteger(req.targetLevel) ? req.targetLevel : 0;
    const weight =
      req && typeof req.weight === 'number' && Number.isFinite(req.weight)
        ? req.weight
        : 0;
    const currentLevel = safeCurrentLevel(assessment, skillId);

    let gap = targetLevel - currentLevel;
    if (gap < 0) gap = 0;
    if (gap > 100) gap = 100;

    return { skillId, name, currentLevel, targetLevel, weight, gap };
  });

  entries.sort((a, b) => {
    if (a.gap !== b.gap) return b.gap - a.gap; // gap desc
    if (a.weight !== b.weight) return b.weight - a.weight; // weight desc
    const an = a.name.toLowerCase();
    const bn = b.name.toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  return entries;
}

/**
 * Predicate used by the Gap Closer celebration and badge (Reqs 6.3, 6.5).
 *
 * Returns `true` iff the gap list has at least one entry AND every entry's
 * `gap` is exactly 0. An empty list returns `false` so the celebration is
 * never shown when there is nothing to close.
 *
 * @param {Array<{gap: number}>} gapList
 * @returns {boolean}
 */
export function allGapsClosed(gapList) {
  if (!Array.isArray(gapList) || gapList.length === 0) return false;
  return gapList.every((entry) => entry != null && entry.gap === 0);
}

// ─── serializeRoadmap / parseRoadmap (Task 10) ──────────────────────────────
//
// Round-trip pair used to persist Roadmap objects to Firestore + the local
// pending-write queue (Requirement 16). Both functions are pure and project
// onto the documented Roadmap shape only — extra non-documented fields are
// silently dropped so two callers that disagree on extension keys still hit
// the same cache entry.
//
// Documented Roadmap fields (see design.md `interface Roadmap`):
//   id, dreamJobId, generatedAt, phases
//
// Documented Phase fields:
//   id, label, weekStart, weekEnd, focusSkills, topics, resources, projectIds,
//   completedAt (optional)
//
// Documented Resource fields:
//   title, provider, topic   (no URL — Req 9.5)
//
// Error message contract (Reqs 16.5–16.8):
//   - `Invalid roadmap input` prefix → wrong top-level input type to either
//     function (non-object / non-string / object whose phases is not array).
//   - `Invalid roadmap JSON` prefix → `parseRoadmap` got a string that
//     `JSON.parse` rejected.
//   - `Malformed roadmap` prefix → `parseRoadmap` got a string that parsed
//     into a value violating the structural Roadmap shape.

function projectResource(resource) {
  if (!isPlainObject(resource)) return resource;
  const out = {};
  if (resource.title !== undefined) out.title = resource.title;
  if (resource.provider !== undefined) out.provider = resource.provider;
  if (resource.topic !== undefined) out.topic = resource.topic;
  return out;
}

function projectPhase(phase) {
  if (!isPlainObject(phase)) return phase;
  const out = {};
  if (phase.id !== undefined) out.id = phase.id;
  if (phase.label !== undefined) out.label = phase.label;
  if (phase.weekStart !== undefined) out.weekStart = phase.weekStart;
  if (phase.weekEnd !== undefined) out.weekEnd = phase.weekEnd;
  if (phase.focusSkills !== undefined) out.focusSkills = phase.focusSkills;
  if (phase.topics !== undefined) out.topics = phase.topics;
  if (phase.resources !== undefined) {
    out.resources = Array.isArray(phase.resources)
      ? phase.resources.map(projectResource)
      : phase.resources;
  }
  if (phase.projectIds !== undefined) out.projectIds = phase.projectIds;
  // completedAt: drop only when undefined; preserve null/empty strings/etc.
  // verbatim per the implementation notes (the parser will reject malformed
  // values via the structural rules below if the caller round-trips a string
  // that contains them).
  if (phase.completedAt !== undefined) out.completedAt = phase.completedAt;
  return out;
}

function projectRoadmap(roadmap) {
  const out = {};
  if (roadmap.id !== undefined) out.id = roadmap.id;
  if (roadmap.dreamJobId !== undefined) out.dreamJobId = roadmap.dreamJobId;
  if (roadmap.generatedAt !== undefined) out.generatedAt = roadmap.generatedAt;
  // phases is required by both serialize and parse; the array shape itself is
  // validated upstream so we just project here.
  out.phases = Array.isArray(roadmap.phases)
    ? roadmap.phases.map(projectPhase)
    : roadmap.phases;
  return out;
}

/**
 * Serializes a Roadmap onto its documented JSON projection.
 *
 * Validates only the top-level invariants; per-phase shape (positive-integer
 * weekStart/weekEnd, weekStart ≤ weekEnd) is enforced on the parse side so
 * that legacy Firestore documents written before the structural-rule rollout
 * can still be re-serialized without crashing the writer.
 *
 * @param {object} r Roadmap candidate
 * @returns {string} `JSON.stringify` of the projection
 * @throws {Error} `Invalid roadmap input ...` on any top-level violation
 *   (Req 16.8).
 */
export function serializeRoadmap(r) {
  if (!isPlainObject(r)) {
    throw new Error('Invalid roadmap input: must be an object');
  }
  if (!Array.isArray(r.phases)) {
    throw new Error('Invalid roadmap input: phases must be an array');
  }
  return JSON.stringify(projectRoadmap(r));
}

/**
 * Parses a serialized Roadmap string back into a documented Roadmap object.
 *
 * Three-tier error contract (Reqs 16.5–16.7):
 *   - `Invalid roadmap input ...` when the input is not a string.
 *   - `Invalid roadmap JSON ...` when `JSON.parse` rejects the string.
 *   - `Malformed roadmap ...` when the parsed value violates the Roadmap
 *     structural shape (non-object, missing/non-array `phases`, or any phase
 *     with non-positive-integer `weekStart`/`weekEnd` or `weekStart > weekEnd`).
 *
 * @param {string} s candidate Roadmap JSON
 * @returns {object} Roadmap projected onto documented fields
 * @throws {Error}
 */
export function parseRoadmap(s) {
  if (typeof s !== 'string') {
    throw new Error('Invalid roadmap input: must be a string');
  }

  let parsed;
  try {
    parsed = JSON.parse(s);
  } catch (err) {
    const detail = err && typeof err.message === 'string' ? err.message : 'parse failed';
    throw new Error(`Invalid roadmap JSON: ${detail}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error('Malformed roadmap: parsed value must be an object');
  }
  if (!Array.isArray(parsed.phases)) {
    throw new Error('Malformed roadmap: phases must be an array');
  }

  for (let i = 0; i < parsed.phases.length; i += 1) {
    const phase = parsed.phases[i];
    if (!isPlainObject(phase)) {
      throw new Error(`Malformed roadmap: phase at index ${i} must be an object`);
    }
    if (!Number.isInteger(phase.weekStart) || phase.weekStart < 1) {
      throw new Error(
        `Malformed roadmap: phase at index ${i} has weekStart that is not a positive integer`
      );
    }
    if (!Number.isInteger(phase.weekEnd) || phase.weekEnd < 1) {
      throw new Error(
        `Malformed roadmap: phase at index ${i} has weekEnd that is not a positive integer`
      );
    }
    if (phase.weekStart > phase.weekEnd) {
      throw new Error(
        `Malformed roadmap: phase at index ${i} has weekStart > weekEnd`
      );
    }
  }

  return projectRoadmap(parsed);
}

// ─── applyTraitGains (Task 11) ──────────────────────────────────────────────
//
// Pure helper used by the Simulation completion flow to apply
// Inferred_Skill_Gain (Requirement 5). For each trait emitted by the chosen
// scenario option, the configured `traitMap[trait]` is looked up; for every
// `skillId` in that mapping that also appears in the user's *active*
// Skill_Requirements set, the user's `currentLevel` for that skill is
// increased by `floor(rewardXp / 4)` and clamped to `[0, 100]` via
// `clampLevel`.
//
// Behavior contract (Reqs 5.1, 5.2, 5.3):
//   - Pure: returns a new `Skill_Assessment` and never mutates any input.
//   - Increment per `(trait, skillId)` pair: if `traitMap[trait]` lists the
//     same `skillId` twice (or the same trait shows up twice in `traits`),
//     the increment is intentionally applied twice — duplicates compound.
//   - Skips traits with no mapping (`traitMap[trait]` absent or empty).
//   - Skips `skillId`s not in `activeSkillIds` (Req 5.3).
//   - `activeSkillIds` may be either a `Set<string>` or an array; both are
//     accepted and normalized internally for O(1) lookup.
//   - Defensive: when `assessment` or `assessment.skills` is null/undefined,
//     starts from an empty `skills` map; when `traits` is not an array,
//     treats it as empty and returns the assessment unchanged.
//   - Preserves every non-`skills` field on `assessment` (e.g. `updatedAt`)
//     verbatim. The caller (Simulation flow) sets a fresh `updatedAt` only
//     when it actually persists (Req 5.4).
//   - Uses `clampLevel` so any pre-existing non-integer or out-of-range
//     entry on `assessment.skills` is normalized into `[0, 100]` before /
//     after the increment.
//
// Notes:
//   - `Math.floor(rewardXp / 4)` is computed verbatim from the documented
//     formula. Per Req 5.1 the inference flow only fires when
//     `rewardXp > 0`, so in production `increment >= 0`. For `rewardXp <= 3`
//     the increment is `0`, which is the no-op case validated by Property 18.

/**
 * Returns a new `Skill_Assessment` with Inferred_Skill_Gains applied.
 *
 * @param {object|null|undefined} assessment current Skill_Assessment
 * @param {Array<string>|null|undefined} traits trait list emitted by the
 *   chosen Simulation option
 * @param {number} rewardXp XP awarded by the chosen option
 * @param {Record<string, string[]>} traitMap deterministic trait → skillId
 *   mapping (see `src/data/skillTraitMap.js`)
 * @param {Set<string>|Array<string>} activeSkillIds skillIds in the user's
 *   active Skill_Requirements set
 * @returns {object} new Skill_Assessment (input untouched)
 */
export function applyTraitGains(assessment, traits, rewardXp, traitMap, activeSkillIds) {
  // Normalize the input assessment defensively. We always return a fresh
  // object so the caller can pass the value to React state setters without
  // worrying about stale references.
  const baseSkills =
    isPlainObject(assessment) && isPlainObject(assessment.skills)
      ? assessment.skills
      : {};

  // activeSkillIds may be a Set or an array; coerce to a Set once for O(1)
  // membership checks inside the inner loop.
  const activeSet =
    activeSkillIds instanceof Set
      ? activeSkillIds
      : new Set(Array.isArray(activeSkillIds) ? activeSkillIds : []);

  const map = isPlainObject(traitMap) ? traitMap : {};
  const traitList = Array.isArray(traits) ? traits : [];

  const increment =
    typeof rewardXp === 'number' && Number.isFinite(rewardXp)
      ? Math.floor(rewardXp / 4)
      : 0;

  // Start from a shallow copy of the base skills map. We mutate this copy
  // freely; the caller never sees it as the original `assessment.skills`
  // object.
  const newSkills = { ...baseSkills };

  if (increment !== 0 && traitList.length > 0) {
    for (const trait of traitList) {
      const mapped = Array.isArray(map[trait]) ? map[trait] : [];
      for (const skillId of mapped) {
        if (typeof skillId !== 'string') continue;
        if (!activeSet.has(skillId)) continue;

        // Apply the increment ONCE per (trait, skillId) pair, clamping
        // after each addition. Because `increment >= 0` in production,
        // the iterative clamp matches a bulk
        // `clampLevel(baseLevel + count * increment)`; we keep the
        // per-pair form because the contract is documented per pair.
        const current = newSkills[skillId];
        const baseLevel =
          typeof current === 'number' && Number.isFinite(current) ? current : 0;
        newSkills[skillId] = clampLevel(baseLevel + increment);
      }
    }
  }

  if (isPlainObject(assessment)) {
    // Preserve every extra field on assessment (notably `updatedAt`) but
    // always overwrite `skills` with the new map.
    return { ...assessment, skills: newSkills };
  }
  return { skills: newSkills };
}

// ─── Deterministic helpers (Task 14) ────────────────────────────────────────
//
// Pure utilities consumed by `SkillBridgeContext`, the SkillBridge UI, and
// the property based tests in skillbridgeService.test.js. None of these
// functions read `Date.now`, `Math.random`, or perform any I/O.

const XP_BY_DIFFICULTY = { easy: 20, medium: 40, hard: 60 };

/**
 * XP awarded for completing a Project of the given difficulty.
 *
 * Matches the documented mapping `{ easy: 20, medium: 40, hard: 60 }` exactly
 * (Reqs 11.4, 11.5, 11.6, 20.5).
 *
 * @param {string} d one of `easy`, `medium`, `hard`
 * @returns {number} XP award (always one of 20, 40, 60)
 * @throws {Error} `Unknown difficulty: <d>` for any other value.
 */
export function xpForDifficulty(d) {
  if (Object.prototype.hasOwnProperty.call(XP_BY_DIFFICULTY, d)) {
    return XP_BY_DIFFICULTY[d];
  }
  throw new Error(`Unknown difficulty: ${String(d)}`);
}

function isCompletedPhase(phase) {
  return (
    isPlainObject(phase) &&
    typeof phase.completedAt === 'string' &&
    phase.completedAt.length > 0
  );
}

/**
 * Computes the integer roadmap completion percentage (Reqs 13.4, 13.5).
 *
 * Returns `0` for empty / missing phases so the Dashboard never divides by
 * zero. For non-empty phases, returns `Math.floor(0.5 + 100 * completed /
 * total)` so halves round up. The result is clamped to `[0, 100]` defensively
 * even though the formula already lives in that range.
 *
 * `completed` counts phases whose `completedAt` field is a non-empty string
 * (Req 13.4 — "non-empty ISO-8601 string"; we don't re-validate ISO-8601
 * here because that's enforced by the persistence layer).
 *
 * @param {{phases?: Array}|null|undefined} roadmap
 * @returns {number} integer in [0, 100]
 */
export function roadmapCompletionPct(roadmap) {
  if (!isPlainObject(roadmap)) return 0;
  const phases = roadmap.phases;
  if (!Array.isArray(phases) || phases.length === 0) return 0;

  let completed = 0;
  for (const phase of phases) {
    if (isCompletedPhase(phase)) completed += 1;
  }

  const raw = (100 * completed) / phases.length;
  let pct = Math.floor(0.5 + raw); // halves round up
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

/**
 * Predicate matching the design.md Property 27 definition (Reqs 9.6, 9.7, 9.9):
 *
 *   isPhaseCompletable(p, P) ===
 *     p.projectIds.length > 0 &&
 *     p.projectIds.every(id => P.some(e => e.projectId === id))
 *
 * Defensive against missing/non-array `projectIds` and non-array `portfolio`:
 * both shapes return `false` rather than throwing, since the caller (PhaseCard)
 * uses this to decide whether to enable the "Mark phase complete" button.
 *
 * @param {{projectIds?: string[]}|null|undefined} phase
 * @param {Array<{projectId?: string}>|null|undefined} portfolio
 * @returns {boolean}
 */
export function isPhaseCompletable(phase, portfolio) {
  if (!isPlainObject(phase)) return false;
  const projectIds = phase.projectIds;
  if (!Array.isArray(projectIds) || projectIds.length === 0) return false;
  const entries = Array.isArray(portfolio) ? portfolio : [];
  if (entries.length === 0) return false;

  const completedSet = new Set();
  for (const entry of entries) {
    if (isPlainObject(entry) && typeof entry.projectId === 'string') {
      completedSet.add(entry.projectId);
    }
  }

  for (const id of projectIds) {
    if (!completedSet.has(id)) return false;
  }
  return true;
}

/**
 * Returns a new roadmap with `completedAt` set on the phase whose `id` matches
 * `phaseId`. All other phases are returned by reference (Property 28: "every
 * other phase is unchanged"). When no phase matches, the input roadmap is
 * returned verbatim (defensive — the caller never expects to clobber an
 * unrelated phase).
 *
 * @param {{phases: Array<{id: string}>}} roadmap
 * @param {string} phaseId
 * @param {string} isoTimestamp ISO-8601 string to write to `phase.completedAt`
 * @returns {object} new Roadmap (input untouched)
 * @throws {Error} `Invalid roadmap input ...` when the roadmap shape is wrong.
 */
export function markPhaseComplete(roadmap, phaseId, isoTimestamp) {
  if (!isPlainObject(roadmap)) {
    throw new Error('Invalid roadmap input: roadmap must be an object');
  }
  if (!Array.isArray(roadmap.phases)) {
    throw new Error('Invalid roadmap input: phases must be an array');
  }
  if (typeof phaseId !== 'string') {
    throw new Error('Invalid roadmap input: phaseId must be a string');
  }
  if (typeof isoTimestamp !== 'string') {
    throw new Error('Invalid roadmap input: isoTimestamp must be a string');
  }

  let matched = false;
  const newPhases = roadmap.phases.map((phase) => {
    if (isPlainObject(phase) && phase.id === phaseId) {
      matched = true;
      return { ...phase, completedAt: isoTimestamp };
    }
    return phase;
  });

  if (!matched) return roadmap;
  return { ...roadmap, phases: newPhases };
}

/**
 * Validates the project completion form (Reqs 11.1, 11.2, 11.8).
 *
 * Returns `true` iff:
 *   - `notes` is empty OR a string of length ≤ 2000.
 *   - `url` is empty OR a string of length ≤ 2048 starting with `http://` or
 *     `https://`.
 *
 * Both fields are optional. Non-string inputs (other than `null`/`undefined`,
 * which are treated as empty) are rejected.
 *
 * @param {{url?: string, notes?: string}|null|undefined} form
 * @returns {boolean}
 */
export function validateCompletionForm(form) {
  if (form === null || form === undefined) return true;
  if (!isPlainObject(form)) return false;

  const url = form.url;
  if (url !== undefined && url !== null && url !== '') {
    if (typeof url !== 'string') return false;
    if (url.length > 2048) return false;
    if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  }

  const notes = form.notes;
  if (notes !== undefined && notes !== null && notes !== '') {
    if (typeof notes !== 'string') return false;
    if (notes.length > 2000) return false;
  }

  return true;
}

/**
 * Pure list-append helper for the Portfolio (Reqs 11.3, 11.9).
 *
 * If a Portfolio entry with `completionEvent.projectId` already exists in
 * `portfolio`, returns `portfolio` unchanged (idempotent dedup). Otherwise
 * returns a new array with `completionEvent` appended. The shape of
 * `completionEvent` is enforced upstream by `validateCompletionForm` and the
 * caller; this helper does not re-validate it.
 *
 * @param {Array<{projectId: string}>} portfolio existing entries
 * @param {{projectId: string}} completionEvent canonical Portfolio_Entry
 * @returns {Array} new portfolio (or the input by reference on dedup)
 */
export function markProjectComplete(portfolio, completionEvent) {
  const list = Array.isArray(portfolio) ? portfolio : [];
  if (!isPlainObject(completionEvent)) return list;
  const projectId = completionEvent.projectId;
  if (typeof projectId !== 'string' || projectId.length === 0) return list;

  for (const entry of list) {
    if (isPlainObject(entry) && entry.projectId === projectId) {
      return portfolio; // duplicate → input unchanged (Req 11.9)
    }
  }
  return list.concat([completionEvent]);
}

/**
 * Pure helper that removes every Portfolio entry whose `projectId === projectId`
 * (Req 11.10). Stable on missing projectId — returns the input array unchanged
 * when nothing matches.
 *
 * @param {Array<{projectId: string}>} portfolio
 * @param {string} projectId
 * @returns {Array}
 */
export function unmarkProjectComplete(portfolio, projectId) {
  if (!Array.isArray(portfolio)) return [];
  if (typeof projectId !== 'string' || projectId.length === 0) return portfolio;

  let found = false;
  const filtered = [];
  for (const entry of portfolio) {
    if (isPlainObject(entry) && entry.projectId === projectId) {
      found = true;
      continue;
    }
    filtered.push(entry);
  }
  return found ? filtered : portfolio;
}

function toKebabCase(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Deterministic fallback Skill_Requirement list derived from a `careers.js`
 * entry (Reqs 2.5, 2.7).
 *
 * For every entry in `careerEntry.skills`, emits one Skill_Requirement with:
 *   - `skillId` = kebab-case of the skill string (e.g., `'Problem Solving'` →
 *     `'problem-solving'`)
 *   - `name`    = the original skill string
 *   - `targetLevel` = 80
 *   - `weight`  = `1 / skills.length`
 *   - `rationale` = ''
 *
 * When `careerEntry` is malformed or `skills` is empty/missing, returns `[]`.
 *
 * @param {{skills?: string[]}|null|undefined} careerEntry
 * @returns {Array<{skillId: string, name: string, targetLevel: number, weight: number, rationale: string}>}
 */
export function fallbackRequirements(careerEntry) {
  if (!isPlainObject(careerEntry)) return [];
  const skills = Array.isArray(careerEntry.skills) ? careerEntry.skills : [];
  if (skills.length === 0) return [];

  const weight = 1 / skills.length;
  return skills.map((skill) => ({
    skillId: toKebabCase(skill),
    name: typeof skill === 'string' ? skill : String(skill),
    targetLevel: 80,
    weight,
    rationale: '',
  }));
}

/**
 * Builds a complete `{ [skillId]: level }` seed map covering every active
 * Skill_Requirement (Reqs 3.2, 3.7, 3.8).
 *
 * Per-skill resolution:
 *   - `skillId` missing from `partialSeed`           → `50`
 *   - `partialSeed[skillId]` is a finite number      → `clampLevel(value)`
 *   - `partialSeed[skillId]` is anything else        → `50`
 *
 * Output values are always integers in `[0, 100]`. The output key set equals
 * the set of valid `requirements[*].skillId` values (entries with non-string
 * or empty skillIds are silently dropped).
 *
 * @param {Array<{skillId: string}>} requirements active Skill_Requirements
 * @param {Record<string, unknown>|null|undefined} partialSeed seed levels
 *   from the `/seed-assessment` endpoint
 * @returns {Record<string, number>}
 */
export function mergeSeed(requirements, partialSeed) {
  const reqs = Array.isArray(requirements) ? requirements : [];
  const seed = isPlainObject(partialSeed) ? partialSeed : {};

  const out = {};
  const seen = new Set();
  for (const req of reqs) {
    if (!isPlainObject(req)) continue;
    const skillId = req.skillId;
    if (typeof skillId !== 'string' || skillId.length === 0) continue;
    if (seen.has(skillId)) continue; // dedup like Req 2.7
    seen.add(skillId);

    if (!Object.prototype.hasOwnProperty.call(seed, skillId)) {
      out[skillId] = 50;
      continue;
    }
    const value = seed[skillId];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      out[skillId] = 50;
      continue;
    }
    out[skillId] = clampLevel(value);
  }
  return out;
}

// ─── buildFallbackRoadmap (Task 12) ─────────────────────────────────────────
//
// Pure curated-catalog fallback used by `SkillBridgeContext.generateRoadmap`
// when the Bedrock backend is unreachable AND no cached roadmap exists for
// the current `(uid, dreamJobId, profileHash)` triple (Req 8.8).
//
// Behavior contract:
//   - Filters `catalog` to entries whose `careerIds` array includes the
//     given `dreamJobId`.
//   - Throws `Error('Insufficient catalog projects for ...')` when fewer
//     than 3 entries match. The caller surfaces this as the user-visible
//     "Couldn't reach the AI roadmap engine" banner combined with a hard
//     stop on roadmap generation.
//   - Partitions the matched list into 3 deterministic phases by difficulty
//     (`easy` → Foundations, `medium` → Build, `hard` → Mastery) and assigns
//     fixed week ranges 1–2 / 3–5 / 6–8 (Req 8.5: weekStart ≤ weekEnd,
//     Req 8.4: 1–3 projectIds per phase).
//   - Each phase receives 1–3 project ids drawn from its primary difficulty
//     bucket. If a bucket happens to be empty (the curated catalog from
//     Task 3 guarantees ≥ 1 entry per difficulty per careerId, but this
//     fallback is also used by tests / future catalogs), we borrow exactly
//     one unused project from the matched list sorted by `id` ascending so
//     every phase always has at least one project.
//   - `focusSkills` for each phase is the deduplicated union of every
//     contained project's `skills` array, in first-seen order.
//   - `topics` and `resources` are intentionally empty — the fallback path
//     never includes resources or AI-generated topic copy (Req 9.5
//     "no URL field rendered" + the broader contract that the curated
//     fallback is purely a project list).
//   - `generatedAt` is the deterministic epoch placeholder
//     `'1970-01-01T00:00:00.000Z'` so this function stays pure (no
//     `new Date()` / `Date.now()`). The caller may override `generatedAt`
//     after the fact when persisting if a wall-clock value is needed.
//
// Output must satisfy `validateRoadmapResponse({ ok: true, roadmap })`
// (Property 36, Property 20).

const FALLBACK_ROADMAP_GENERATED_AT = '1970-01-01T00:00:00.000Z';

function compareById(a, b) {
  const ia = a && a.id != null ? String(a.id) : '';
  const ib = b && b.id != null ? String(b.id) : '';
  if (ia < ib) return -1;
  if (ia > ib) return 1;
  return 0;
}

/**
 * Builds the curated-catalog fallback Roadmap for the given dream job.
 *
 * @param {string} dreamJobId non-empty string career id from `careers.js`.
 * @param {Array<{id: string, careerIds: string[], skills: string[], difficulty: 'easy'|'medium'|'hard'}>} catalog
 *   curated project catalog (typically the default export of
 *   `src/data/projects.js`).
 * @returns {{id: string, dreamJobId: string, generatedAt: string, phases: object[]}}
 *   a Roadmap that satisfies `validateRoadmapResponse({ ok: true, roadmap })`.
 * @throws {Error} `Insufficient catalog projects for ${dreamJobId}` when the
 *   filtered catalog has fewer than 3 entries.
 */
export function buildFallbackRoadmap(dreamJobId, catalog) {
  if (typeof dreamJobId !== 'string' || dreamJobId.length === 0) {
    throw new Error(
      'Invalid fallback roadmap input: dreamJobId must be a non-empty string'
    );
  }
  if (!Array.isArray(catalog)) {
    throw new Error('Invalid fallback roadmap input: catalog must be an array');
  }

  // Filter to projects matching this career id, then pin a deterministic
  // canonical ordering by `id` ascending so the rest of the algorithm is
  // independent of the catalog's source-file ordering.
  const matched = catalog
    .filter(
      (p) =>
        isPlainObject(p) &&
        Array.isArray(p.careerIds) &&
        p.careerIds.includes(dreamJobId) &&
        typeof p.id === 'string' &&
        p.id.length > 0
    )
    .slice()
    .sort(compareById);

  if (matched.length < 3) {
    throw new Error(
      `Insufficient catalog projects for ${dreamJobId}: need at least 3, found ${matched.length}`
    );
  }

  const easy = matched.filter((p) => p.difficulty === 'easy');
  const medium = matched.filter((p) => p.difficulty === 'medium');
  const hard = matched.filter((p) => p.difficulty === 'hard');

  const usedIds = new Set();

  // Take up to 3 projects from `primary`, skipping any id already assigned
  // to an earlier phase. When the result is empty (primary bucket was empty
  // or fully consumed), borrow exactly one unused project from the matched
  // pool so the phase still has the required ≥ 1 project (Req 8.4).
  function takeForPhase(primary) {
    const out = [];
    for (const p of primary) {
      if (out.length >= 3) break;
      if (usedIds.has(p.id)) continue;
      out.push(p);
      usedIds.add(p.id);
    }
    if (out.length === 0) {
      for (const p of matched) {
        if (usedIds.has(p.id)) continue;
        out.push(p);
        usedIds.add(p.id);
        break;
      }
    }
    return out;
  }

  const phase1Projects = takeForPhase(easy);
  const phase2Projects = takeForPhase(medium);
  const phase3Projects = takeForPhase(hard);

  function buildPhase(id, label, weekStart, weekEnd, projects) {
    const focusSkills = [];
    const seenSkills = new Set();
    for (const project of projects) {
      const skills = Array.isArray(project.skills) ? project.skills : [];
      for (const skill of skills) {
        if (typeof skill !== 'string') continue;
        if (seenSkills.has(skill)) continue;
        seenSkills.add(skill);
        focusSkills.push(skill);
      }
    }
    return {
      id,
      label,
      weekStart,
      weekEnd,
      focusSkills,
      topics: [],
      resources: [],
      projectIds: projects.map((p) => p.id),
    };
  }

  const phases = [
    buildPhase('phase-1', 'Foundations', 1, 2, phase1Projects),
    buildPhase('phase-2', 'Build', 3, 5, phase2Projects),
    buildPhase('phase-3', 'Mastery', 6, 8, phase3Projects),
  ];

  return {
    id: `fallback-${dreamJobId}`,
    dreamJobId,
    generatedAt: FALLBACK_ROADMAP_GENERATED_AT,
    phases,
  };
}

// ─── assembleRoadmap / validateProjectsUnique (Task 15) ─────────────────────
//
// Pure helpers that turn a Bedrock-returned Roadmap into a finalized Roadmap
// with concrete `projectIds` per phase, drawn from the curated catalog first,
// the AI catalog second, and a `careerIds`-based fallback last
// (Reqs 10.2, 10.3, 10.5, 10.6, 10.7, 10.9).
//
// Per-phase fill rules:
//   1. Run `sortProjectsForPhase(curatedCatalog, focusSkills)` and take up to
//      3 entries whose skills actually overlap `focusSkills` and whose ids are
//      not already used by an earlier phase.
//   2. If pass 1 produced zero ids, repeat against `aiCatalog` with the same
//      overlap requirement.
//   3. If pass 2 still produced zero ids, pick the first unused project (by
//      `sortProjectsForPhase(catalog, [])` ordering — difficulty asc, then id
//      asc) whose `careerIds` includes `roadmap.dreamJobId`. Curated is tried
//      before AI. This guarantees ≥ 1 project per phase whenever any catalog
//      entry matches the dream job.
//   4. If even the careerIds fallback yields nothing, throw
//      `Error('Cannot assemble roadmap: ...')`.
//
// Global invariant: ids are tracked in a single `usedIds` Set across phases,
// so the union of all phase `projectIds` is duplicate-free
// (Property 34 / Req 10.9).

function isUsableProjectForAssembly(p) {
  return isPlainObject(p) && typeof p.id === 'string' && p.id.length > 0;
}

/**
 * Returns a new Roadmap with each phase's `projectIds` re-derived from the
 * supplied catalogs (Reqs 10.2, 10.3, 10.5, 10.6, 10.7, 10.9).
 *
 * The returned roadmap preserves every non-`projectIds` field on each phase
 * and every non-`phases` field on the roadmap (top-level shape unchanged).
 *
 * @param {{dreamJobId?: string, phases: Array<{focusSkills?: string[]}>}} roadmap
 * @param {Array} curatedCatalog list of curated Project entries.
 * @param {Array} aiCatalog list of AI-generated Project entries.
 * @returns {object} a new Roadmap with finalized `projectIds` per phase.
 * @throws {Error} `Cannot assemble roadmap: ...` when the roadmap shape is
 *   wrong or a phase has no candidate projects.
 */
export function assembleRoadmap(roadmap, curatedCatalog, aiCatalog) {
  if (!isPlainObject(roadmap)) {
    throw new Error('Cannot assemble roadmap: roadmap must be an object');
  }
  if (!Array.isArray(roadmap.phases)) {
    throw new Error('Cannot assemble roadmap: phases must be an array');
  }

  const curated = Array.isArray(curatedCatalog) ? curatedCatalog : [];
  const ai = Array.isArray(aiCatalog) ? aiCatalog : [];
  const dreamJobId =
    typeof roadmap.dreamJobId === 'string' && roadmap.dreamJobId.length > 0
      ? roadmap.dreamJobId
      : null;

  const usedIds = new Set();

  // Pass 1 / 2: take up to `max` ids from `catalog` whose skills overlap
  // `focusSkills` and whose id is not already used.
  function takeOverlapping(catalog, focusSkills, focusSet, max) {
    const sorted = sortProjectsForPhase(catalog, focusSkills);
    const out = [];
    for (const p of sorted) {
      if (out.length >= max) break;
      if (!isUsableProjectForAssembly(p)) continue;
      if (usedIds.has(p.id)) continue;
      if (focusOverlapCount(p, focusSet) <= 0) continue;
      usedIds.add(p.id);
      out.push(p.id);
    }
    return out;
  }

  // Pass 3: pick the first unused project (deterministic difficulty-asc /
  // id-asc ordering via `sortProjectsForPhase(catalog, [])`) whose
  // `careerIds` includes `dreamJobId`. Returns one id or null.
  function pickByCareer(catalog) {
    if (dreamJobId == null) return null;
    const sorted = sortProjectsForPhase(catalog, []);
    for (const p of sorted) {
      if (!isUsableProjectForAssembly(p)) continue;
      if (usedIds.has(p.id)) continue;
      if (!Array.isArray(p.careerIds)) continue;
      if (!p.careerIds.includes(dreamJobId)) continue;
      usedIds.add(p.id);
      return p.id;
    }
    return null;
  }

  const newPhases = roadmap.phases.map((phase, phaseIdx) => {
    const focusSkills =
      isPlainObject(phase) && Array.isArray(phase.focusSkills)
        ? phase.focusSkills
        : [];
    const focusSet = new Set(focusSkills);

    let projectIds = takeOverlapping(curated, focusSkills, focusSet, 3);
    if (projectIds.length === 0) {
      projectIds = takeOverlapping(ai, focusSkills, focusSet, 3);
    }
    if (projectIds.length === 0) {
      const fallback = pickByCareer(curated);
      if (fallback != null) {
        projectIds = [fallback];
      } else {
        const fallbackAi = pickByCareer(ai);
        if (fallbackAi != null) projectIds = [fallbackAi];
      }
    }

    if (projectIds.length === 0) {
      throw new Error(
        `Cannot assemble roadmap: phase at index ${phaseIdx} has no candidate projects`
      );
    }

    if (!isPlainObject(phase)) {
      // Defensive: real Bedrock output is always plain-object phases. We
      // still want a usable shape if a caller passes a malformed phase
      // entry through.
      return { projectIds };
    }
    return { ...phase, projectIds };
  });

  return { ...roadmap, phases: newPhases };
}

/**
 * Predicate: returns `true` iff `roadmap` has an array `phases` and the union
 * of every phase's `projectIds` (each itself an array) contains no duplicate
 * project id (Req 10.9, Property 34). Returns `false` on any malformed input.
 *
 * @param {unknown} roadmap
 * @returns {boolean}
 */
export function validateProjectsUnique(roadmap) {
  if (!isPlainObject(roadmap)) return false;
  if (!Array.isArray(roadmap.phases)) return false;

  const seen = new Set();
  for (const phase of roadmap.phases) {
    if (!isPlainObject(phase)) return false;
    if (!Array.isArray(phase.projectIds)) return false;
    for (const id of phase.projectIds) {
      if (seen.has(id)) return false;
      seen.add(id);
    }
  }
  return true;
}

// ─── Network fetchers (Task 24) ─────────────────────────────────────────────
//
// Thin wrappers over the four `POST /api/skillbridge/*` endpoints. Each
// fetcher:
//   1. Composes the caller-supplied `AbortSignal` with an internal timeout
//      via `composeAbortSignal`, so the timeout fires even when the caller
//      passes no signal.
//   2. Issues a single `fetch` with `Content-Type: application/json`.
//   3. Treats any non-2xx HTTP status as a thrown error.
//   4. Re-validates the response body with the existing pure validator
//      (`validateRequirementsResponse`, `validateSeedAssessmentResponse`,
//      `validateRoadmapResponse`, or `validateProjectsResponse`).
//   5. Always calls `cleanup()` to clear the timeout regardless of outcome.
//
// Failure semantics differ per fetcher (Reqs 2.5, 3.8, 8.8, 10.8):
//   - `fetchRequirements`     → swallow every failure (incl. abort) and
//                                return `fallbackRequirements(careerEntry)`.
//   - `fetchSeedAssessment`   → swallow every failure and return
//                                `mergeSeed(requirements, {})` (every level
//                                defaults to 50).
//   - `fetchRoadmap`          → propagate the error; the caller decides
//                                between cached and curated fallback.
//   - `fetchProjects`         → propagate the error; the caller decides
//                                whether to fall back to the curated
//                                catalog filtered by `careerIds`.
//
// All four fetchers respect a caller-supplied `AbortSignal` (Req 21.5):
// when the external signal aborts, the in-flight fetch is aborted as well.

/**
 * Composes an external `AbortSignal` with an internal timeout.
 *
 * Returns an object `{ signal, cleanup }`:
 *   - `signal` is aborted when the external signal aborts OR when
 *     `timeoutMs` elapses, whichever happens first.
 *   - `cleanup()` clears the internal timer and detaches the listener on
 *     the external signal. Callers MUST invoke `cleanup()` after the
 *     await chain (success path, error path, or abort path).
 *
 * If `externalSignal` is `null`/`undefined`, only the timeout governs the
 * composed signal. If `externalSignal` is already aborted, the composed
 * signal is aborted synchronously before this function returns.
 *
 * @param {AbortSignal|null|undefined} externalSignal
 * @param {number} timeoutMs
 * @returns {{ signal: AbortSignal, cleanup: () => void }}
 */
function composeAbortSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();

  const onExternalAbort = () => {
    // Use the original abort reason when available so the rejected fetch
    // surfaces it; otherwise fall back to a parameterless abort.
    if (externalSignal && 'reason' in externalSignal) {
      try {
        controller.abort(externalSignal.reason);
        return;
      } catch (_) {
        // Older runtimes ignore the reason argument; fall through.
      }
    }
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort);
    }
  }

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  };

  return { signal: controller.signal, cleanup };
}

async function postJson(url, body, signal) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json();
}

/**
 * Fetches the AI-generated Skill_Requirement list for a career
 * (Reqs 2.1, 2.5, 21.5).
 *
 * Posts `{ careerId }` to `/api/skillbridge/requirements` with a 15-second
 * internal timeout composed with `signal`. On any failure (network error,
 * non-2xx response, invalid JSON, validator rejection, timeout, or external
 * abort), returns `fallbackRequirements(careerEntry)` instead of throwing.
 * The fallback is the deterministic kebab-case projection of the
 * `careers.js` entry's `skills` list.
 *
 * @param {string} careerId
 * @param {{skills?: string[]}|null|undefined} careerEntry the matching
 *   `careers.js` entry used for the fallback projection.
 * @param {AbortSignal} [signal]
 * @returns {Promise<Array<{skillId: string, name: string, targetLevel: number, weight: number, rationale: string}>>}
 *   always resolves with a Skill_Requirement[] (never throws).
 */
export async function fetchRequirements(careerId, careerEntry, signal) {
  const composed = composeAbortSignal(signal, 15000);
  try {
    const payload = await postJson(
      '/api/skillbridge/requirements',
      { careerId },
      composed.signal
    );
    if (!validateRequirementsResponse(payload)) {
      throw new Error('Invalid /api/skillbridge/requirements response');
    }
    return payload.requirements;
  } catch (_) {
    return fallbackRequirements(careerEntry);
  } finally {
    composed.cleanup();
  }
}

/**
 * Fetches the seed Skill_Assessment levels for a user
 * (Reqs 3.1, 3.8, 21.5).
 *
 * Posts `{ resumeText, profile, requirements }` to
 * `/api/skillbridge/seed-assessment` with a 10-second internal timeout
 * composed with `signal`. On any failure returns
 * `mergeSeed(requirements, {})`, which fills every active skillId with the
 * default level `50`.
 *
 * On success, returns the validated `payload.levels` map. The caller is
 * expected to pass it through `mergeSeed` to backfill any skillId the AI
 * omitted (Req 3.7) before persisting.
 *
 * @param {object|null|undefined} profile user profile snapshot.
 * @param {Array<{skillId: string}>} requirements active Skill_Requirements.
 * @param {string} resumeText parsed résumé text (may be empty).
 * @param {AbortSignal} [signal]
 * @returns {Promise<Record<string, number>>}
 *   always resolves with a `{ [skillId]: int }` map (never throws).
 */
export async function fetchSeedAssessment(profile, requirements, resumeText, signal) {
  const composed = composeAbortSignal(signal, 10000);
  try {
    const payload = await postJson(
      '/api/skillbridge/seed-assessment',
      { resumeText, profile, requirements },
      composed.signal
    );
    if (!validateSeedAssessmentResponse(payload)) {
      throw new Error('Invalid /api/skillbridge/seed-assessment response');
    }
    return payload.levels;
  } catch (_) {
    return mergeSeed(requirements, {});
  } finally {
    composed.cleanup();
  }
}

/**
 * Fetches the AI-generated Roadmap for a `(dreamJobId, requirements,
 * assessment, profile)` tuple (Reqs 8.1, 21.5).
 *
 * Posts `payload` to `/api/skillbridge/roadmap` with a 30-second internal
 * timeout composed with `signal`. On success, returns the validated
 * `roadmap` object; on any failure (network error, non-2xx response,
 * validator rejection, timeout, or external abort) re-throws so the caller
 * can decide between the cached roadmap (Req 8.9) and the curated fallback
 * (Req 8.8).
 *
 * @param {{dreamJobId: string, requirements: object[], assessment: object, profile: object}} payload
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} validated Roadmap.
 * @throws {Error} on any failure.
 */
export async function fetchRoadmap(payload, signal) {
  const composed = composeAbortSignal(signal, 30000);
  try {
    const body = await postJson(
      '/api/skillbridge/roadmap',
      payload,
      composed.signal
    );
    if (!validateRoadmapResponse(body)) {
      throw new Error('Invalid /api/skillbridge/roadmap response');
    }
    return body.roadmap;
  } finally {
    composed.cleanup();
  }
}

/**
 * Fetches AI-generated Projects to top off a Phase whose curated catalog
 * coverage is below the required count (Reqs 10.3, 10.4, 10.8, 21.5).
 *
 * Posts `payload` (`{ careerId, focusSkills, count, excludeIds }`) to
 * `/api/skillbridge/projects` with a 10-second internal timeout composed
 * with `signal`. On success returns the validated `projects` array (every
 * entry has `aiGenerated === true` per Req 10.4); on any failure re-throws
 * so the caller can fall back to curated projects filtered by `careerIds`.
 *
 * @param {{careerId: string, focusSkills: string[], count: number, excludeIds: string[]}} payload
 * @param {AbortSignal} [signal]
 * @returns {Promise<Array<object>>} validated AI-generated Project list.
 * @throws {Error} on any failure.
 */
export async function fetchProjects(payload, signal) {
  const composed = composeAbortSignal(signal, 10000);
  try {
    const body = await postJson(
      '/api/skillbridge/projects',
      payload,
      composed.signal
    );
    if (!validateProjectsResponse(body)) {
      throw new Error('Invalid /api/skillbridge/projects response');
    }
    return body.projects;
  } finally {
    composed.cleanup();
  }
}

// ─── Firestore writers + persistence helpers (Task 25) ──────────────────────
//
// Thin Firestore writers used by `SkillBridgeContext` to persist SkillBridge
// state to `users/{uid}.skillbridge.<key>`. All five writers compose the same
// `setDoc(..., { merge: true })` shape so a partial write can never clobber
// other unrelated SkillBridge keys (Req 19.2).
//
// Reachability + retry behavior live in `persistWithRetry` and
// `isFirestoreReachable` below (Reqs 19.3, 19.7). Both are pure relative to
// the supplied `write` function / `(state, event)` pair, which is what makes
// them target-able from `fast-check`.

const SKILLBRIDGE_PERSIST_TIMEOUT_MS = 5000;
const SKILLBRIDGE_PERSIST_RETRY_DELAY_MS = 1000;
const SKILLBRIDGE_LOCAL_STORAGE_PREFIX = 'skillbridge_pending_';

/**
 * Persists the user's `Skill_Assessment` to Firestore (Req 19.2).
 *
 * Writes `{ skillbridge: { skillAssessment: a } }` to `users/{uid}` with
 * `merge: true` so other SkillBridge keys are preserved.
 *
 * @param {string} uid
 * @param {object} a Skill_Assessment shape.
 * @returns {Promise<void>}
 */
export async function persistAssessment(uid, a) {
  await setDoc(
    doc(db, 'users', uid),
    { skillbridge: { skillAssessment: a } },
    { merge: true }
  );
}

/**
 * Persists the user's `currentRoadmap` to Firestore (Req 19.2).
 *
 * @param {string} uid
 * @param {object} r Roadmap shape.
 * @returns {Promise<void>}
 */
export async function persistRoadmap(uid, r) {
  await setDoc(
    doc(db, 'users', uid),
    { skillbridge: { currentRoadmap: r } },
    { merge: true }
  );
}

/**
 * Persists the user's `Portfolio` array to Firestore (Req 19.2).
 *
 * @param {string} uid
 * @param {Array<object>} p Portfolio_Entry list.
 * @returns {Promise<void>}
 */
export async function persistPortfolio(uid, p) {
  await setDoc(
    doc(db, 'users', uid),
    { skillbridge: { portfolio: p } },
    { merge: true }
  );
}

/**
 * Persists the active `Skill_Requirement` list for one career to the
 * `requirementsCache.{careerId}` slot (Req 19.2 + Req 2.4).
 *
 * Uses a nested `merge: true` write so other careers' cached requirements
 * are preserved.
 *
 * @param {string} uid
 * @param {string} careerId
 * @param {Array<object>} reqs Skill_Requirement list.
 * @returns {Promise<void>}
 */
export async function persistRequirementsCache(uid, careerId, reqs) {
  await setDoc(
    doc(db, 'users', uid),
    { skillbridge: { requirementsCache: { [careerId]: reqs } } },
    { merge: true }
  );
}

/**
 * Appends a single archived `Roadmap` to `archivedRoadmaps` via Firestore's
 * `arrayUnion` sentinel (Req 1.4 + Req 19.2). `arrayUnion` keeps the write
 * idempotent on retry: if `persistWithRetry` re-issues this call after a
 * timeout, the same roadmap won't be appended twice.
 *
 * @param {string} uid
 * @param {object} r Roadmap shape with `archivedAt` already set by caller.
 * @returns {Promise<void>}
 */
export async function persistArchivedRoadmap(uid, r) {
  await setDoc(
    doc(db, 'users', uid),
    { skillbridge: { archivedRoadmaps: arrayUnion(r) } },
    { merge: true }
  );
}

/**
 * Calls `write` once. If the first attempt rejects OR fails to settle within
 * `5000ms`, waits `1000ms` and calls `write` exactly one more time, then
 * surfaces the second attempt's outcome (Req 19.3).
 *
 * Contract:
 *   - `write` is invoked at most 2 times in total (Property 37).
 *   - When the first attempt resolves before the timeout, the result is
 *     returned and `write` is NOT called a second time.
 *   - When the first attempt rejects, the rejection is swallowed and a
 *     second attempt is scheduled after a 1s delay.
 *   - When the first attempt is still pending after 5s, the wrapper
 *     proceeds to a second attempt after a 1s delay (the first attempt's
 *     eventual resolution / rejection is discarded — the caller is
 *     observing the second attempt only).
 *   - The second attempt's outcome (resolution value or rejection) is the
 *     wrapper's outcome.
 *
 * @template T
 * @param {() => Promise<T>} write
 * @returns {Promise<T>}
 */
export function persistWithRetry(write) {
  return new Promise((resolve, reject) => {
    let firstSettled = false;
    let secondScheduled = false;

    const scheduleSecondAttempt = () => {
      if (secondScheduled) return;
      secondScheduled = true;
      setTimeout(() => {
        // Second (and last) attempt — its outcome is the wrapper's outcome.
        let secondResult;
        try {
          secondResult = write();
        } catch (err) {
          reject(err);
          return;
        }
        Promise.resolve(secondResult).then(resolve, reject);
      }, SKILLBRIDGE_PERSIST_RETRY_DELAY_MS);
    };

    // Kick off the first attempt and register both a 5s timeout and the
    // standard then/catch handlers. Whichever fires first wins; the loser
    // is suppressed via the `firstSettled` flag.
    let firstResult;
    try {
      firstResult = write();
    } catch (err) {
      // Synchronous throw counts as a rejection for retry purposes.
      firstSettled = true;
      scheduleSecondAttempt();
      // Swallow `err` — we only surface the second attempt's outcome.
      void err;
      return;
    }

    const timeoutId = setTimeout(() => {
      if (firstSettled) return;
      firstSettled = true;
      scheduleSecondAttempt();
    }, SKILLBRIDGE_PERSIST_TIMEOUT_MS);

    Promise.resolve(firstResult).then(
      (value) => {
        if (firstSettled) return;
        firstSettled = true;
        clearTimeout(timeoutId);
        resolve(value);
      },
      (err) => {
        if (firstSettled) return;
        firstSettled = true;
        clearTimeout(timeoutId);
        scheduleSecondAttempt();
        // Swallow `err` — we only surface the second attempt's outcome.
        void err;
      }
    );
  });
}

/**
 * Pure reducer for the Firestore reachability state machine (Req 19.7,
 * Property 38).
 *
 * States:
 *   - `'reachable'`   — initial state, and the state after a `'write_succeeded'` event.
 *   - `'unreachable'` — set after a `'write_failed'` event; persists until a
 *     subsequent `'write_succeeded'` flips it back.
 *
 * Behavior:
 *   - Unknown / falsy `state`         → `'reachable'` (the initial-state default).
 *   - `event === 'write_succeeded'`   → `'reachable'`.
 *   - `event === 'write_failed'`      → `'unreachable'`.
 *   - Unknown event                   → state unchanged.
 *
 * Pure: no I/O, no clock reads.
 *
 * @param {'reachable'|'unreachable'|undefined|null|string} state
 * @param {'write_succeeded'|'write_failed'|string} event
 * @returns {'reachable'|'unreachable'}
 */
export function isFirestoreReachable(state, event) {
  const current =
    state === 'reachable' || state === 'unreachable' ? state : 'reachable';
  if (event === 'write_succeeded') return 'reachable';
  if (event === 'write_failed') return 'unreachable';
  return current;
}

function localStorageKey(uid) {
  return `${SKILLBRIDGE_LOCAL_STORAGE_PREFIX}${uid}`;
}

/**
 * Mirrors the in-memory snapshot to `localStorage` under
 * `skillbridge_pending_{uid}` (Req 19.4). Augments the snapshot with a fresh
 * `pendingAt` ISO-8601 timestamp so callers can age out stale queues.
 *
 * Always swallows storage-quota / unavailability errors (Req 19.9) — the
 * caller surfaces "Local backup unavailable" via the banners stack instead.
 *
 * @param {string} uid
 * @param {object} snapshot in-memory SkillBridge snapshot to mirror.
 * @returns {void}
 */
export function writeLocalStorageQueue(uid, snapshot) {
  try {
    const payload = JSON.stringify({
      ...(snapshot || {}),
      pendingAt: new Date().toISOString(),
    });
    localStorage.setItem(localStorageKey(uid), payload);
  } catch (_) {
    // Quota exceeded, localStorage unavailable, or JSON.stringify rejected
    // a circular value — all degrade silently to "no-op" per Req 19.9.
  }
}

/**
 * Reads the pending snapshot from `localStorage` under
 * `skillbridge_pending_{uid}` (Req 19.8). Returns the parsed object on
 * success, or `null` when:
 *   - the key is missing,
 *   - `localStorage.getItem` throws, or
 *   - `JSON.parse` rejects the payload.
 *
 * @param {string} uid
 * @returns {object|null}
 */
export function readLocalStorageQueue(uid) {
  try {
    const raw = localStorage.getItem(localStorageKey(uid));
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Clears the pending snapshot under `skillbridge_pending_{uid}` after a
 * successful Firestore sync (Req 19.6).
 *
 * Always swallows storage errors so the caller's success path is
 * unaffected.
 *
 * @param {string} uid
 * @returns {void}
 */
export function clearLocalStorageQueue(uid) {
  try {
    localStorage.removeItem(localStorageKey(uid));
  } catch (_) {
    // No-op — clearing is best-effort. Req 19.9 covers the read/write side.
  }
}
