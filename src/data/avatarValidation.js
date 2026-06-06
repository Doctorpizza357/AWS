/**
 * Validation functions for avatar character definitions and checkpoint messages.
 * Ensures data integrity at module load time by filtering invalid entries
 * and logging structured warnings for developer visibility.
 */

const REQUIRED_FIELDS = [
  'id',
  'displayName',
  'visualAsset',
  'culturalBackground',
  'genderPresentation',
  'altText',
];

/**
 * Validates an array of avatar character definitions.
 * Returns only characters with all required fields present and non-empty.
 * Logs a warning for each invalid character identifying the character ID and missing field.
 *
 * @param {Array} characters - Array of avatar character objects to validate
 * @returns {Array} Filtered array containing only valid characters
 */
function validateAvatarPool(characters) {
  if (!Array.isArray(characters)) {
    console.warn('[AvatarValidation] avatarCharacters is not an array');
    return [];
  }

  return characters.filter((character) => {
    const characterId = (character && character.id) || 'unknown';
    let isValid = true;

    for (const field of REQUIRED_FIELDS) {
      if (
        !character ||
        typeof character[field] !== 'string' ||
        character[field].trim() === ''
      ) {
        console.warn(
          `[AvatarValidation] Character "${characterId}" excluded: missing or empty required field "${field}"`
        );
        isValid = false;
      }
    }

    return isValid;
  });
}

/**
 * Validates checkpoint message configurations.
 * Verifies each checkpoint has at least 3 messages for adequate variety.
 * Logs a warning for checkpoints with 0 messages.
 *
 * @param {Array} checkpointMessages - Array of checkpoint message objects
 * @returns {boolean} True if all checkpoints meet the minimum message requirement
 */
function validateCheckpointMessages(checkpointMessages) {
  if (!Array.isArray(checkpointMessages)) {
    console.warn('[AvatarValidation] checkpointMessages is not an array');
    return false;
  }

  let allValid = true;

  for (const checkpoint of checkpointMessages) {
    const checkpointId =
      (checkpoint && checkpoint.checkpointId) || 'unknown';
    const messages =
      checkpoint && Array.isArray(checkpoint.messages)
        ? checkpoint.messages
        : [];

    if (messages.length === 0) {
      console.warn(
        `[AvatarValidation] Checkpoint "${checkpointId}" has 0 messages — avatar display will be skipped for this checkpoint`
      );
      allValid = false;
    } else if (messages.length < 3) {
      console.warn(
        `[AvatarValidation] Checkpoint "${checkpointId}" has ${messages.length} message(s), minimum 3 required for adequate variety`
      );
      allValid = false;
    }
  }

  return allValid;
}

module.exports = { validateAvatarPool, validateCheckpointMessages };
