/**
 * Curated_Project_Catalog
 *
 * Static dataset of buildable Projects shipped with SkillBridge AI.
 * Consumed by the roadmap builder to seed Phase.projectIds before any AI
 * augmentation, and by buildFallbackRoadmap when the Bedrock backend is
 * unreachable.
 *
 * Shape (per Requirement 10.1):
 *   {
 *     id: string,                 // unique across this catalog (kebab-case)
 *     careerIds: string[],        // ids matching entries in src/data/careers.js
 *     skills: string[],           // skill labels from careers.js.skills
 *     difficulty: 'easy' | 'medium' | 'hard',
 *     title: string,
 *     summary: string,
 *     deliverables: string[],     // length in [1, 10]
 *     estHours: number,           // integer in [1, 200]
 *   }
 *
 * Invariants enforced by tests / consumers:
 *   - Every `id` is unique across the catalog.
 *   - Every career id in src/data/careers.js appears in `careerIds` for at
 *     least 3 entries with at least one project at each of difficulty
 *     'easy', 'medium', and 'hard' so buildFallbackRoadmap can produce a
 *     3-phase roadmap.
 *   - `aiGenerated` is intentionally omitted here. It is added only on
 *     projects returned by POST /api/skillbridge/projects (Req 10.4).
 */

const projects = [
  // -------- software-engineer --------
  {
    id: 'se-cli-todo',
    careerIds: ['software-engineer'],
    skills: ['Programming', 'Problem Solving'],
    difficulty: 'easy',
    title: 'Command-Line To-Do List',
    summary:
      'Build a small CLI to-do app that reads, writes, and updates tasks stored in a local JSON file.',
    deliverables: [
      'Source repo with README and run instructions',
      'JSON-backed task store with add/list/complete/delete commands',
      'Unit tests covering each command',
    ],
    estHours: 12,
  },
  {
    id: 'se-rest-api-auth',
    careerIds: ['software-engineer', 'cloud-architect'],
    skills: ['Programming', 'System Design'],
    difficulty: 'medium',
    title: 'REST API With Auth',
    summary:
      'Design and ship a small REST API with token-based authentication, persistent storage, and integration tests.',
    deliverables: [
      'OpenAPI specification document',
      'Implementation with at least 5 endpoints',
      'Token-based auth middleware',
      'Integration test suite',
      'Deployment notes',
    ],
    estHours: 40,
  },
  {
    id: 'se-distributed-job-queue',
    careerIds: ['software-engineer'],
    skills: ['System Design', 'Programming', 'Problem Solving'],
    difficulty: 'hard',
    title: 'Distributed Job Queue',
    summary:
      'Implement a multi-worker job queue with retries, dead-letter handling, and back-pressure controls.',
    deliverables: [
      'Architecture diagram and trade-off write-up',
      'Producer + worker implementations',
      'Retry and dead-letter policy',
      'Load test report',
      'Operational runbook',
    ],
    estHours: 90,
  },
  {
    id: 'se-pair-debug-clinic',
    careerIds: ['software-engineer'],
    skills: ['Collaboration', 'Problem Solving'],
    difficulty: 'easy',
    title: 'Pair Debugging Clinic',
    summary:
      'Run three structured pair-debugging sessions on open issues, documenting hypotheses and fixes.',
    deliverables: [
      'Session notes for each pair',
      'Linked PRs or patches for the issues investigated',
      'Short retrospective on what improved',
    ],
    estHours: 9,
  },

  // -------- data-scientist --------
  {
    id: 'ds-eda-public-dataset',
    careerIds: ['data-scientist'],
    skills: ['Statistics', 'Python'],
    difficulty: 'easy',
    title: 'Exploratory Data Analysis On A Public Dataset',
    summary:
      'Pick a public dataset and produce a notebook with descriptive statistics, visualizations, and three concrete findings.',
    deliverables: [
      'Reproducible Jupyter notebook',
      'Cleaned dataset artifact',
      'Three written findings with supporting charts',
    ],
    estHours: 10,
  },
  {
    id: 'ds-churn-classifier',
    careerIds: ['data-scientist'],
    skills: ['Machine Learning', 'Python', 'Statistics'],
    difficulty: 'medium',
    title: 'Customer Churn Classifier',
    summary:
      'Train and evaluate a churn classifier on tabular data with cross-validation and a written model card.',
    deliverables: [
      'Training notebook with feature pipeline',
      'Cross-validated evaluation report',
      'Model card describing intended use and limits',
      'Inference script',
    ],
    estHours: 50,
  },
  {
    id: 'ds-stakeholder-readout',
    careerIds: ['data-scientist'],
    skills: ['Communication'],
    difficulty: 'easy',
    title: 'Stakeholder Readout Deck',
    summary:
      'Translate a technical analysis into a 10-slide non-technical readout with clear recommendations.',
    deliverables: [
      'Slide deck',
      'One-page executive summary',
    ],
    estHours: 6,
  },
  {
    id: 'ds-deep-recommender',
    careerIds: ['data-scientist'],
    skills: ['Machine Learning', 'Python'],
    difficulty: 'hard',
    title: 'Deep Learning Recommender System',
    summary:
      'Build a two-tower recommender on a public interactions dataset and benchmark against a baseline.',
    deliverables: [
      'Data pipeline scripts',
      'Two-tower model implementation',
      'Baseline comparison report',
      'Offline evaluation metrics',
      'Model serving prototype',
    ],
    estHours: 110,
  },

  // -------- biomedical-engineer --------
  {
    id: 'bme-pulse-oximeter',
    careerIds: ['biomedical-engineer'],
    skills: ['Engineering', 'Biology'],
    difficulty: 'easy',
    title: 'DIY Pulse Oximeter Build',
    summary:
      'Assemble a pulse oximeter from a hobby kit and validate readings against a reference device.',
    deliverables: [
      'Build photos and bill of materials',
      'Validation log against a reference device',
      'Short reflection on signal quality issues',
    ],
    estHours: 14,
  },
  {
    id: 'bme-prosthetic-finger',
    careerIds: ['biomedical-engineer'],
    skills: ['Engineering', 'Problem Solving', 'Research'],
    difficulty: 'medium',
    title: '3D-Printed Prosthetic Finger',
    summary:
      'Design, print, and iterate on a single prosthetic finger module with tendon-driven actuation.',
    deliverables: [
      'CAD source files',
      'Three printed iterations',
      'Range-of-motion test results',
      'Design rationale write-up',
    ],
    estHours: 60,
  },
  {
    id: 'bme-vital-signs-app',
    careerIds: ['biomedical-engineer'],
    skills: ['Engineering', 'Biology'],
    difficulty: 'medium',
    title: 'Vital Signs Logging App',
    summary:
      'Prototype an app that logs heart rate and SpO2 from a Bluetooth sensor and flags out-of-range values.',
    deliverables: [
      'Working prototype binary or web app',
      'Sensor interface module',
      'Range-flagging logic with unit tests',
    ],
    estHours: 40,
  },
  {
    id: 'bme-trial-protocol',
    careerIds: ['biomedical-engineer'],
    skills: ['Research', 'Biology'],
    difficulty: 'hard',
    title: 'Mock Clinical Trial Protocol',
    summary:
      'Author a mock clinical trial protocol for a low-risk wearable, including IRB-style ethics considerations.',
    deliverables: [
      'Trial protocol document',
      'Risk and ethics section',
      'Endpoint and statistics plan',
      'Recruitment criteria',
    ],
    estHours: 80,
  },

  // -------- aerospace-engineer --------
  {
    id: 'ae-water-rocket',
    careerIds: ['aerospace-engineer'],
    skills: ['Physics', 'Mathematics'],
    difficulty: 'easy',
    title: 'Water Rocket Apogee Study',
    summary:
      'Build a water rocket and use measured launches to fit a simple drag model that predicts apogee.',
    deliverables: [
      'Rocket build photos',
      'Launch data spreadsheet',
      'Apogee prediction model write-up',
    ],
    estHours: 10,
  },
  {
    id: 'ae-airfoil-cfd',
    careerIds: ['aerospace-engineer'],
    skills: ['Physics', 'Mathematics', 'CAD'],
    difficulty: 'medium',
    title: 'Airfoil CFD Comparison',
    summary:
      'Model two airfoils in CAD and compare lift-to-drag ratios using an open-source CFD tool.',
    deliverables: [
      'CAD source files for both airfoils',
      'CFD setup notes',
      'Lift-to-drag comparison report with plots',
    ],
    estHours: 55,
  },
  {
    id: 'ae-flight-data-analysis',
    careerIds: ['aerospace-engineer'],
    skills: ['Mathematics'],
    difficulty: 'easy',
    title: 'Public Flight Data Analysis',
    summary:
      'Use a public flight telemetry dataset to compute climb-rate distributions for a chosen airframe.',
    deliverables: [
      'Analysis notebook',
      'Climb-rate histogram with discussion',
    ],
    estHours: 8,
  },
  {
    id: 'ae-cubesat-thermal',
    careerIds: ['aerospace-engineer'],
    skills: ['Thermodynamics', 'Physics', 'CAD'],
    difficulty: 'hard',
    title: 'CubeSat Thermal Budget',
    summary:
      'Produce a thermal budget for a 3U CubeSat in low Earth orbit, including conduction and radiation paths.',
    deliverables: [
      'CAD model of the CubeSat structure',
      'Thermal node diagram',
      'Worst-case hot and cold case analysis',
      'Margin and risk write-up',
    ],
    estHours: 130,
  },

  // -------- environmental-scientist --------
  {
    id: 'es-watershed-survey',
    careerIds: ['environmental-scientist'],
    skills: ['Field Work', 'Research'],
    difficulty: 'easy',
    title: 'Local Watershed Survey',
    summary:
      'Sample three points along a local stream, log basic water quality metrics, and map the results.',
    deliverables: [
      'Field log with sample coordinates',
      'Water quality measurement spreadsheet',
      'Annotated map of the survey route',
    ],
    estHours: 12,
  },
  {
    id: 'es-citizen-science-kit',
    careerIds: ['environmental-scientist'],
    skills: ['Field Work', 'Research'],
    difficulty: 'easy',
    title: 'Citizen Science Sampling Kit',
    summary:
      'Design a low-cost sampling kit and sampling protocol that volunteers can follow in under 30 minutes.',
    deliverables: [
      'Bill of materials with cost estimate',
      'One-page sampling protocol',
      'Two pilot runs with collected data',
    ],
    estHours: 10,
  },
  {
    id: 'es-air-quality-dashboard',
    careerIds: ['environmental-scientist'],
    skills: ['Data Analysis', 'Research'],
    difficulty: 'medium',
    title: 'Neighborhood Air Quality Dashboard',
    summary:
      'Pull a public air quality feed, persist daily values, and visualize trends for one neighborhood.',
    deliverables: [
      'Ingestion script',
      'Persisted dataset',
      'Dashboard with at least three charts',
      'Short methodology note',
    ],
    estHours: 40,
  },
  {
    id: 'es-impact-assessment-report',
    careerIds: ['environmental-scientist'],
    skills: ['Research', 'Policy', 'Data Analysis'],
    difficulty: 'hard',
    title: 'Mock Environmental Impact Assessment',
    summary:
      'Author a mock environmental impact assessment for a small construction project, including a policy review.',
    deliverables: [
      'Project description and baseline conditions',
      'Impact identification matrix',
      'Mitigation plan',
      'Policy and regulatory review',
      'Summary recommendation',
    ],
    estHours: 80,
  },

  // -------- cybersecurity-analyst --------
  {
    id: 'ca-phishing-quiz',
    careerIds: ['cybersecurity-analyst'],
    skills: ['Communication'],
    difficulty: 'easy',
    title: 'Phishing Awareness Quiz',
    summary:
      'Build a 10-question phishing awareness quiz and run it with a small group, tracking pre and post scores.',
    deliverables: [
      'Quiz questions and rubric',
      'Anonymized result summary',
      'Short awareness write-up',
    ],
    estHours: 10,
  },
  {
    id: 'ca-password-audit',
    careerIds: ['cybersecurity-analyst'],
    skills: ['Threat Analysis'],
    difficulty: 'easy',
    title: 'Personal Password Hygiene Audit',
    summary:
      'Audit a small set of accounts for password reuse and 2FA coverage, producing a remediation plan.',
    deliverables: [
      'Audit checklist',
      'Findings report (anonymized)',
      'Remediation plan with priorities',
    ],
    estHours: 8,
  },
  {
    id: 'ca-soc-playbook',
    careerIds: ['cybersecurity-analyst'],
    skills: ['Threat Analysis', 'Incident Response'],
    difficulty: 'medium',
    title: 'SOC Phishing Playbook',
    summary:
      'Write a SOC playbook for triaging phishing reports, including escalation criteria and timing targets.',
    deliverables: [
      'Playbook document',
      'Escalation matrix',
      'Tabletop walkthrough notes',
    ],
    estHours: 40,
  },
  {
    id: 'ca-network-segmentation-lab',
    careerIds: ['cybersecurity-analyst'],
    skills: ['Networking', 'Threat Analysis'],
    difficulty: 'hard',
    title: 'Home Network Segmentation Lab',
    summary:
      'Stand up a segmented home lab with VLANs and firewall rules, and prove isolation under attack tests.',
    deliverables: [
      'Network diagram',
      'VLAN and firewall configuration export',
      'Attack test plan',
      'Isolation verification report',
    ],
    estHours: 80,
  },

  // -------- cloud-architect --------
  {
    id: 'cl-static-site-cdn',
    careerIds: ['cloud-architect'],
    skills: ['AWS'],
    difficulty: 'easy',
    title: 'Static Site Behind A CDN',
    summary:
      'Deploy a static site to object storage fronted by a CDN with HTTPS and cache-control configured.',
    deliverables: [
      'Deployment script or template',
      'Custom domain with HTTPS configured',
      'Cache-control documentation',
    ],
    estHours: 10,
  },
  {
    id: 'cl-cost-optimizer-report',
    careerIds: ['cloud-architect'],
    skills: ['Cost Optimization', 'AWS'],
    difficulty: 'medium',
    title: 'Cloud Cost Optimization Report',
    summary:
      'Audit a sample cloud account, identify the top three savings opportunities, and quantify expected impact.',
    deliverables: [
      'Cost breakdown by service',
      'Top three savings recommendations',
      'Projected savings model',
    ],
    estHours: 30,
  },
  {
    id: 'cl-iac-pipeline',
    careerIds: ['cloud-architect'],
    skills: ['AWS', 'System Design'],
    difficulty: 'medium',
    title: 'Infrastructure-as-Code Pipeline',
    summary:
      'Codify a small environment in Terraform or CloudFormation and wire it into a CI pipeline with plan and apply gates.',
    deliverables: [
      'IaC source repo',
      'CI pipeline configuration',
      'Plan and apply gating policy',
      'Rollback runbook',
    ],
    estHours: 50,
  },
  {
    id: 'cl-multi-region-failover',
    careerIds: ['cloud-architect'],
    skills: ['AWS', 'Networking', 'System Design'],
    difficulty: 'hard',
    title: 'Multi-Region Failover Design',
    summary:
      'Design and demonstrate a multi-region active-passive failover for a small web service with measured RTO and RPO.',
    deliverables: [
      'Architecture diagram',
      'Failover runbook',
      'Measured RTO and RPO results',
      'Cost and trade-off analysis',
    ],
    estHours: 110,
  },

  // -------- robotics-engineer --------
  {
    id: 'rb-line-follower',
    careerIds: ['robotics-engineer'],
    skills: ['Mechanical Design', 'Programming', 'Sensors'],
    difficulty: 'easy',
    title: 'Line Follower Robot',
    summary:
      'Build a small line-following robot from a hobby kit and tune its controller on a printed track.',
    deliverables: [
      'Build photos and bill of materials',
      'Controller source code',
      'Lap-time log on the test track',
    ],
    estHours: 16,
  },
  {
    id: 'rb-gripper-iteration',
    careerIds: ['robotics-engineer'],
    skills: ['Mechanical Design'],
    difficulty: 'medium',
    title: 'Soft Gripper Iteration',
    summary:
      'Design three iterations of a soft gripper and benchmark grasp success on five common household objects.',
    deliverables: [
      'CAD files for each iteration',
      'Print or fabrication notes',
      'Benchmark results table',
    ],
    estHours: 30,
  },
  {
    id: 'rb-pick-and-place-arm',
    careerIds: ['robotics-engineer'],
    skills: ['Mechanical Design', 'Control Systems', 'Programming'],
    difficulty: 'medium',
    title: 'Tabletop Pick And Place Arm',
    summary:
      'Program a tabletop arm to pick blocks from a tray and place them into labeled bins using basic vision.',
    deliverables: [
      'Arm control source code',
      'Vision pipeline configuration',
      'Demo video of repeated runs',
      'Failure-mode notes',
    ],
    estHours: 60,
  },
  {
    id: 'rb-warehouse-slam',
    careerIds: ['robotics-engineer'],
    skills: ['Sensors', 'Control Systems', 'Programming'],
    difficulty: 'hard',
    title: 'Indoor SLAM Demonstration',
    summary:
      'Run a 2D SLAM stack on a small mobile platform in a cluttered indoor environment and evaluate map quality.',
    deliverables: [
      'Recorded sensor logs',
      'Generated map artifacts',
      'Map quality evaluation write-up',
      'Tuning notes for the SLAM stack',
    ],
    estHours: 140,
  },

  // -------- renewable-energy-engineer --------
  {
    id: 're-home-solar-sizing',
    careerIds: ['renewable-energy-engineer'],
    skills: ['Energy Systems', 'Modeling'],
    difficulty: 'easy',
    title: 'Home Solar Sizing Estimate',
    summary:
      'Estimate panel count and inverter sizing for a sample home using public irradiance and load profiles.',
    deliverables: [
      'Sizing spreadsheet',
      'Assumptions and sources document',
      'One-page recommendation summary',
    ],
    estHours: 12,
  },
  {
    id: 're-battery-sizing-tool',
    careerIds: ['renewable-energy-engineer'],
    skills: ['Energy Systems', 'Modeling'],
    difficulty: 'medium',
    title: 'Battery Sizing Tool',
    summary:
      'Build a small tool that suggests battery capacity given a load profile, target backup hours, and budget.',
    deliverables: [
      'Tool source code',
      'Validation against two reference cases',
      'User guide',
    ],
    estHours: 40,
  },
  {
    id: 're-microgrid-simulation',
    careerIds: ['renewable-energy-engineer'],
    skills: ['Energy Systems', 'Modeling', 'Problem Solving'],
    difficulty: 'medium',
    title: 'Small Microgrid Simulation',
    summary:
      'Simulate a small solar-plus-storage microgrid over a year and report self-consumption and outage tolerance.',
    deliverables: [
      'Simulation source code',
      'Annual self-consumption chart',
      'Outage tolerance analysis',
      'Sensitivity write-up',
    ],
    estHours: 60,
  },
  {
    id: 're-wind-farm-siting',
    careerIds: ['renewable-energy-engineer'],
    skills: ['Modeling', 'Environmental Awareness', 'Problem Solving'],
    difficulty: 'hard',
    title: 'Wind Farm Siting Study',
    summary:
      'Compare three candidate wind farm sites using public wind data and write a siting recommendation.',
    deliverables: [
      'Wind resource summary per site',
      'Land-use and environmental considerations',
      'Levelized cost estimate',
      'Final siting recommendation',
    ],
    estHours: 90,
  },
];

export default projects;
