/**
 * FeatureRouter - Maps campus buildings to existing feature screens.
 * Each of the 9 career paths maps to exactly one building (bijective mapping).
 */
import campusConfig from '../data/campusConfig.json';

// Career path to building mapping (bijective - 1:1)
const CAREER_BUILDING_MAP = {
  'software-engineer': 'software-engineering',
  'data-scientist': 'data-science',
  'cybersecurity-analyst': 'cybersecurity',
  'mechanical-engineer': 'mechanical-engineering',
  'electrical-engineer': 'electrical-engineering',
  'environmental-scientist': 'environmental-science',
  'biomedical-engineer': 'biomedical-engineering',
  'healthcare-technologist': 'healthcare-tech',
  'ux-designer': 'ux-design',
};

// Reverse mapping: building → career path
const BUILDING_CAREER_MAP = Object.fromEntries(
  Object.entries(CAREER_BUILDING_MAP).map(([career, building]) => [building, career])
);

// Special building sections
const SPECIAL_BUILDING_SECTIONS = {
  'interview-hall': {
    route: '/interview',
    sections: {
      mock: '/interview/mock',
      resume: '/interview/resume',
      technical: '/interview/technical',
    },
  },
  'market-observatory': {
    route: '/market-intelligence',
    sections: {
      heatmap: '/market-intelligence',
      'salary-arc': '/market-intelligence',
      'viability-radar': '/market-intelligence',
      'opportunity-score': '/market-intelligence',
      overview: '/market-intelligence',
    },
  },
  'skill-forge': {
    route: '/skillbridge',
    sections: {
      'dream-job': '/skillbridge',
      'self-assessment': '/skillbridge',
      'gap-analysis': '/skillbridge',
      roadmap: '/skillbridge',
    },
  },
  'student-union': {
    route: '/leaderboard',
    sections: {
      leaderboard: '/leaderboard',
      profile: '/profile',
      badges: '/profile',
      'role-models': '/role-models',
    },
  },
};

/**
 * Get the feature route for a building.
 */
function getFeatureRoute(buildingId, section = null) {
  // Check special buildings first
  const special = SPECIAL_BUILDING_SECTIONS[buildingId];
  if (special) {
    if (section && special.sections[section]) {
      return special.sections[section];
    }
    return special.route;
  }

  // Check career buildings
  const careerPath = BUILDING_CAREER_MAP[buildingId];
  if (careerPath) {
    return `/simulation/${careerPath}`;
  }

  // Look up in config
  const allBuildings = [
    ...campusConfig.zones.flatMap(z => z.buildings),
    ...campusConfig.specialBuildings,
  ];
  const building = allBuildings.find(b => b.id === buildingId);
  return building ? building.featureRoute : null;
}

/**
 * Get building ID from a career path ID.
 */
function getBuildingForCareer(careerPathId) {
  return CAREER_BUILDING_MAP[careerPathId] || null;
}

/**
 * Get career path ID from a building ID.
 */
function getCareerForBuilding(buildingId) {
  return BUILDING_CAREER_MAP[buildingId] || null;
}

/**
 * Get all career-building pairs.
 */
function getAllCareerBuildingPairs() {
  return { ...CAREER_BUILDING_MAP };
}

/**
 * Verify the mapping is bijective.
 */
function verifyBijection() {
  const careers = Object.keys(CAREER_BUILDING_MAP);
  const buildings = Object.values(CAREER_BUILDING_MAP);
  const uniqueBuildings = new Set(buildings);

  return careers.length === 9 &&
    buildings.length === 9 &&
    uniqueBuildings.size === 9;
}

export {
  CAREER_BUILDING_MAP,
  BUILDING_CAREER_MAP,
  SPECIAL_BUILDING_SECTIONS,
  getFeatureRoute,
  getBuildingForCareer,
  getCareerForBuilding,
  getAllCareerBuildingPairs,
  verifyBijection,
};
