/**
 * Guided Path Service - Generates, dismisses, and manages guided exploration paths.
 */
import campusConfig from '../data/campusConfig.json';

const MIN_WAYPOINTS = 3;
const MAX_WAYPOINTS = 7;

class GuidedPathService {
  constructor() {
    this._currentPath = null;
    this._dismissedPath = null;
    this._completedPaths = [];
    this._allBuildingIds = this._collectBuildingIds();
  }

  _collectBuildingIds() {
    const ids = [];
    for (const zone of campusConfig.zones) {
      for (const building of zone.buildings) {
        ids.push(building.id);
      }
    }
    for (const building of campusConfig.specialBuildings) {
      ids.push(building.id);
    }
    return ids;
  }

  /**
   * Generate a guided path based on profile and completed activities.
   * Returns 3–7 waypoints referencing valid building IDs.
   */
  generatePath(profile = {}, completedActivities = []) {
    const completedSet = new Set(completedActivities);
    const available = this._allBuildingIds.filter(id => !completedSet.has(id));

    if (available.length === 0) return null;

    // Determine path length (3–7 waypoints)
    const pathLength = Math.min(
      Math.max(MIN_WAYPOINTS, Math.min(available.length, MAX_WAYPOINTS)),
      available.length
    );

    // Prioritize based on interests
    let waypoints;
    if (profile.interests && profile.interests.length > 0) {
      waypoints = this._prioritizeByInterests(available, profile.interests, pathLength);
    } else {
      // Default: pick a mix from different zones
      waypoints = this._pickDiverse(available, pathLength);
    }

    this._currentPath = {
      id: `path_${Date.now()}`,
      waypoints,
      visited: [],
      dismissed: false,
      createdAt: new Date().toISOString(),
    };

    return this._currentPath;
  }

  _prioritizeByInterests(available, interests, count) {
    // Map interests to zones
    const interestZoneMap = {
      technology: 'tech-hub',
      engineering: 'engineering-quad',
      science: 'science-park',
      health: 'health-sciences',
      creative: 'creative-stem',
    };

    const prioritized = [];
    const rest = [];

    for (const buildingId of available) {
      const zone = this._getBuildingZone(buildingId);
      const isInteresting = interests.some(interest =>
        interestZoneMap[interest] === zone
      );
      if (isInteresting) {
        prioritized.push(buildingId);
      } else {
        rest.push(buildingId);
      }
    }

    // Take from prioritized first, then fill from rest
    const selected = [...prioritized.slice(0, count)];
    if (selected.length < count) {
      selected.push(...rest.slice(0, count - selected.length));
    }

    return selected.slice(0, count);
  }

  _pickDiverse(available, count) {
    // Pick evenly from different zones
    const byZone = {};
    for (const id of available) {
      const zone = this._getBuildingZone(id) || 'other';
      if (!byZone[zone]) byZone[zone] = [];
      byZone[zone].push(id);
    }

    const result = [];
    const zones = Object.keys(byZone);
    let idx = 0;

    while (result.length < count && result.length < available.length) {
      const zone = zones[idx % zones.length];
      if (byZone[zone].length > 0) {
        result.push(byZone[zone].shift());
      }
      idx++;
      // Safety: avoid infinite loop
      if (idx > available.length * 2) break;
    }

    return result;
  }

  _getBuildingZone(buildingId) {
    for (const zone of campusConfig.zones) {
      if (zone.buildings.some(b => b.id === buildingId)) {
        return zone.id;
      }
    }
    for (const building of campusConfig.specialBuildings) {
      if (building.id === buildingId) {
        return building.zone || null;
      }
    }
    return null;
  }

  /**
   * Get current active path.
   */
  getCurrentPath() {
    return this._currentPath;
  }

  /**
   * Mark a waypoint as visited.
   */
  visitWaypoint(buildingId) {
    if (!this._currentPath) return;
    if (!this._currentPath.visited.includes(buildingId)) {
      this._currentPath.visited.push(buildingId);
    }

    // Check if path is complete
    if (this._currentPath.visited.length >= this._currentPath.waypoints.length) {
      this.markPathComplete(this._currentPath.id);
    }
  }

  /**
   * Dismiss current path (preserves for recall).
   */
  dismissPath(pathId) {
    if (this._currentPath && this._currentPath.id === pathId) {
      this._currentPath.dismissed = true;
      this._dismissedPath = { ...this._currentPath };
      this._currentPath = null;
    }
  }

  /**
   * Recall the last dismissed path.
   */
  recallDismissedPath() {
    if (this._dismissedPath) {
      this._currentPath = { ...this._dismissedPath, dismissed: false };
      this._dismissedPath = null;
      return this._currentPath;
    }
    return null;
  }

  /**
   * Mark path as complete and trigger new path generation.
   */
  markPathComplete(pathId) {
    if (this._currentPath && this._currentPath.id === pathId) {
      this._completedPaths.push(this._currentPath);
      this._currentPath = null;
    }
  }

  /**
   * Check if all activities have been completed.
   */
  isAllComplete(completedActivities = []) {
    const completedSet = new Set(completedActivities);
    return this._allBuildingIds.every(id => completedSet.has(id));
  }

  /**
   * Validate that generated path has valid building IDs.
   */
  validatePath(path) {
    if (!path || !path.waypoints) return false;
    if (path.waypoints.length < MIN_WAYPOINTS || path.waypoints.length > MAX_WAYPOINTS) return false;
    return path.waypoints.every(id => this._allBuildingIds.includes(id));
  }

  /**
   * Get serializable state.
   */
  getState() {
    return {
      currentPath: this._currentPath,
      dismissedPath: this._dismissedPath,
      completedPaths: this._completedPaths,
    };
  }

  /**
   * Restore state.
   */
  restoreState(state) {
    if (state.currentPath) this._currentPath = state.currentPath;
    if (state.dismissedPath) this._dismissedPath = state.dismissedPath;
    if (state.completedPaths) this._completedPaths = state.completedPaths;
  }
}

export { MIN_WAYPOINTS, MAX_WAYPOINTS };
export default GuidedPathService;
