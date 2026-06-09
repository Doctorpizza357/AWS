/**
 * Legacy URL redirects - Maps old platform routes to campus building routes.
 */
import redirectMap from '../data/redirectMap.json';

/**
 * Get the campus redirect URL for a legacy route.
 * Returns null if no redirect exists.
 */
function getCampusRedirect(legacyPath) {
  // Exact match
  if (redirectMap[legacyPath]) {
    return redirectMap[legacyPath];
  }

  // Check with trailing slash removed
  const normalized = legacyPath.replace(/\/$/, '');
  if (redirectMap[normalized]) {
    return redirectMap[normalized];
  }

  return null;
}

/**
 * Get all redirect entries.
 */
function getAllRedirects() {
  return { ...redirectMap };
}

/**
 * Check if a path should be redirected.
 */
function shouldRedirect(path) {
  return getCampusRedirect(path) !== null;
}

/**
 * Build a campus URL with building parameter.
 */
function buildCampusUrl(buildingId, section = null) {
  let url = `/campus?building=${buildingId}`;
  if (section) {
    url += `&section=${section}`;
  }
  return url;
}

/**
 * Parse campus URL parameters.
 */
function parseCampusUrl(search) {
  const params = new URLSearchParams(search);
  return {
    building: params.get('building'),
    section: params.get('section'),
  };
}

export {
  getCampusRedirect,
  getAllRedirects,
  shouldRedirect,
  buildCampusUrl,
  parseCampusUrl,
};
