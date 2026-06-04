/**
 * src/data/skillResources.js — Skill_Resource_Dataset (Group C).
 *
 * Pure, static curated dataset that maps each distinct skill label appearing in
 * the `skills` arrays of `src/data/careers.js` to a set of learning `topics`
 * and `resources`. Consumed by the Roadmap_Builder population helpers in
 * `src/services/skillbridgeService.js` to guarantee that every roadmap phase
 * renders at least one topic and one resource.
 *
 * Contract (see requirements.md Requirement 6 / design.md Property 3):
 * - Default export `skillResources`: an object keyed by exact, case-sensitive
 *   skill label (each key 1–120 chars). One entry per distinct `careers.js`
 *   skill label.
 * - Each entry has:
 *     - `topics`: 1–20 items, each a non-empty string of 1–200 chars.
 *     - `resources`: 1–20 items, each a Resource `{ title, provider, topic }`
 *       whose three fields are each non-empty strings of 1–200 chars.
 * - Each Resource has ONLY `title`/`provider`/`topic` — no `url`/`link` field
 *   anywhere (Req 6.8).
 * - Named exports `DEFAULT_TOPICS` / `DEFAULT_RESOURCES` provide deterministic
 *   defaults for any focus skill with no exact-match key (Req 6.5, 6.7).
 *
 * The module imports no runtime state and references `careers.js` only
 * conceptually so the dataset stays a static literal. All exported constants
 * are deep-frozen so repeated reads are identical within a dataset version
 * (Req 6.5).
 */

/**
 * Recursively freeze an object/array and everything reachable from it so that
 * the exported dataset is immutable and repeated reads are identical.
 * @template T
 * @param {T} value
 * @returns {T} the same reference, deeply frozen
 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key]));
  }
  return value;
}

/**
 * Deterministic default topics, used for any focus skill with no exact-match
 * key in the dataset (and when a phase has no focus skills at all).
 * @type {readonly string[]}
 */
export const DEFAULT_TOPICS = deepFreeze([
  'Set clear, measurable learning goals for this phase',
  'Break large objectives into weekly milestones',
  'Build a small portfolio project to apply new skills',
  'Practice deliberately and review your mistakes',
  'Find a community or mentor for feedback',
]);

/**
 * Deterministic default resources, used for any focus skill with no exact-match
 * key in the dataset (and when a phase has no focus skills at all).
 * @type {readonly {title: string, provider: string, topic: string}[]}
 */
export const DEFAULT_RESOURCES = deepFreeze([
  {
    title: 'Learning How to Learn',
    provider: 'Coursera',
    topic: 'Effective study and skill-building techniques',
  },
  {
    title: 'How to Build a Learning Roadmap',
    provider: 'freeCodeCamp',
    topic: 'Structuring a self-directed learning plan',
  },
  {
    title: 'Project-Based Learning Guide',
    provider: 'GitHub',
    topic: 'Learning by building real projects',
  },
]);

/**
 * @type {{ [skillLabel: string]: { topics: string[], resources: {title: string, provider: string, topic: string}[] } }}
 */
const skillResources = {
  'Problem Solving': {
    topics: [
      'Decomposing problems into smaller subproblems',
      'Pattern recognition and analogical reasoning',
      'Algorithmic thinking and complexity tradeoffs',
      'Debugging and root-cause analysis',
    ],
    resources: [
      {
        title: 'How to Solve It',
        provider: 'Princeton University Press',
        topic: 'Heuristics for general problem solving',
      },
      {
        title: 'Problem Solving with Algorithms',
        provider: 'Khan Academy',
        topic: 'Breaking problems into algorithmic steps',
      },
      {
        title: 'LeetCode Practice Problems',
        provider: 'LeetCode',
        topic: 'Hands-on problem-solving practice',
      },
    ],
  },
  Programming: {
    topics: [
      'Core language syntax and data types',
      'Control flow, functions, and modules',
      'Data structures and their tradeoffs',
      'Version control with Git',
      'Writing and running automated tests',
    ],
    resources: [
      {
        title: 'CS50: Introduction to Computer Science',
        provider: 'Harvard / edX',
        topic: 'Programming fundamentals',
      },
      {
        title: 'Responsive Web Design Certification',
        provider: 'freeCodeCamp',
        topic: 'Hands-on coding practice',
      },
      {
        title: 'The Git Handbook',
        provider: 'GitHub',
        topic: 'Version control basics',
      },
    ],
  },
  'System Design': {
    topics: [
      'Scalability, latency, and throughput tradeoffs',
      'Load balancing and caching strategies',
      'Database selection and data partitioning',
      'Designing for reliability and fault tolerance',
    ],
    resources: [
      {
        title: 'System Design Primer',
        provider: 'GitHub',
        topic: 'End-to-end system design fundamentals',
      },
      {
        title: 'Grokking the System Design Interview',
        provider: 'Educative',
        topic: 'Scalable architecture patterns',
      },
      {
        title: 'Designing Data-Intensive Applications',
        provider: "O'Reilly Media",
        topic: 'Data systems and distributed design',
      },
    ],
  },
  Collaboration: {
    topics: [
      'Effective code review and feedback',
      'Agile ceremonies and team workflows',
      'Pair programming and knowledge sharing',
      'Resolving conflicts constructively',
    ],
    resources: [
      {
        title: 'Working in Teams',
        provider: 'Atlassian Agile Coach',
        topic: 'Team collaboration practices',
      },
      {
        title: 'How to Do Code Reviews Well',
        provider: 'Google Engineering Practices',
        topic: 'Giving and receiving code feedback',
      },
      {
        title: 'The Agile Manifesto and Principles',
        provider: 'Agile Alliance',
        topic: 'Collaborative development values',
      },
    ],
  },
  Statistics: {
    topics: [
      'Descriptive statistics and distributions',
      'Probability fundamentals',
      'Hypothesis testing and confidence intervals',
      'Regression and correlation',
    ],
    resources: [
      {
        title: 'Statistics and Probability',
        provider: 'Khan Academy',
        topic: 'Foundational statistics concepts',
      },
      {
        title: 'Introduction to Statistics',
        provider: 'Stanford Online',
        topic: 'Statistical inference and modeling',
      },
      {
        title: 'Think Stats',
        provider: "O'Reilly Media",
        topic: 'Statistics with Python',
      },
    ],
  },
  'Machine Learning': {
    topics: [
      'Supervised vs. unsupervised learning',
      'Model training, validation, and overfitting',
      'Feature engineering and selection',
      'Evaluation metrics and cross-validation',
    ],
    resources: [
      {
        title: 'Machine Learning Specialization',
        provider: 'Coursera',
        topic: 'Core machine learning algorithms',
      },
      {
        title: 'Machine Learning Crash Course',
        provider: 'Google Developers',
        topic: 'Practical ML with TensorFlow',
      },
      {
        title: 'Hands-On Machine Learning',
        provider: "O'Reilly Media",
        topic: 'Applied ML with scikit-learn and Keras',
      },
    ],
  },
  Python: {
    topics: [
      'Python syntax, types, and idioms',
      'Working with libraries and virtual environments',
      'Data manipulation with pandas and NumPy',
      'Writing tests with pytest',
    ],
    resources: [
      {
        title: 'Python for Everybody',
        provider: 'Coursera',
        topic: 'Python programming from scratch',
      },
      {
        title: 'Automate the Boring Stuff with Python',
        provider: 'Al Sweigart',
        topic: 'Practical Python scripting',
      },
      {
        title: 'The Python Tutorial',
        provider: 'Python Software Foundation',
        topic: 'Official Python language guide',
      },
    ],
  },
  Communication: {
    topics: [
      'Structuring clear written updates',
      'Presenting technical work to non-technical audiences',
      'Active listening and asking clarifying questions',
      'Storytelling with data',
    ],
    resources: [
      {
        title: 'Introduction to Public Speaking',
        provider: 'University of Washington / edX',
        topic: 'Presenting ideas with confidence',
      },
      {
        title: 'Technical Writing Courses',
        provider: 'Google Developers',
        topic: 'Clear technical communication',
      },
      {
        title: 'Storytelling with Data',
        provider: 'Wiley',
        topic: 'Communicating insights visually',
      },
    ],
  },
  Biology: {
    topics: [
      'Cell structure and function',
      'Genetics and molecular biology',
      'Human anatomy and physiology',
      'Experimental design in the life sciences',
    ],
    resources: [
      {
        title: 'Introduction to Biology',
        provider: 'MIT OpenCourseWare',
        topic: 'Foundational biology concepts',
      },
      {
        title: 'Biology Library',
        provider: 'Khan Academy',
        topic: 'Cell biology and genetics',
      },
      {
        title: 'Introduction to Human Physiology',
        provider: 'Duke / Coursera',
        topic: 'How body systems work',
      },
    ],
  },
  Engineering: {
    topics: [
      'Engineering design process',
      'Requirements analysis and specifications',
      'Prototyping and iterative testing',
      'Engineering ethics and safety',
    ],
    resources: [
      {
        title: 'Introduction to Engineering',
        provider: 'MIT OpenCourseWare',
        topic: 'Engineering fundamentals and design',
      },
      {
        title: 'Engineering Design Process',
        provider: 'TeachEngineering',
        topic: 'Structured approach to building solutions',
      },
      {
        title: 'Fundamentals of Engineering Review',
        provider: 'NCEES',
        topic: 'Core engineering principles',
      },
    ],
  },
  Research: {
    topics: [
      'Formulating research questions and hypotheses',
      'Literature review and source evaluation',
      'Quantitative and qualitative methods',
      'Citing sources and avoiding plagiarism',
    ],
    resources: [
      {
        title: 'Understanding Research Methods',
        provider: 'University of London / Coursera',
        topic: 'Research design fundamentals',
      },
      {
        title: 'Research Methods Knowledge Base',
        provider: 'Conjointly',
        topic: 'Methodology and measurement',
      },
      {
        title: 'How to Read a Scientific Paper',
        provider: 'Nature',
        topic: 'Critically evaluating literature',
      },
    ],
  },
  Physics: {
    topics: [
      'Classical mechanics and Newton\u2019s laws',
      'Energy, work, and momentum',
      'Electromagnetism fundamentals',
      'Problem solving with vectors and calculus',
    ],
    resources: [
      {
        title: 'Classical Mechanics',
        provider: 'MIT OpenCourseWare',
        topic: 'Newtonian mechanics',
      },
      {
        title: 'Physics Library',
        provider: 'Khan Academy',
        topic: 'Mechanics and electromagnetism',
      },
      {
        title: 'The Feynman Lectures on Physics',
        provider: 'Caltech',
        topic: 'Conceptual physics foundations',
      },
    ],
  },
  Mathematics: {
    topics: [
      'Single and multivariable calculus',
      'Linear algebra and matrices',
      'Differential equations',
      'Mathematical proof techniques',
    ],
    resources: [
      {
        title: 'Single Variable Calculus',
        provider: 'MIT OpenCourseWare',
        topic: 'Differential and integral calculus',
      },
      {
        title: 'Linear Algebra',
        provider: 'Khan Academy',
        topic: 'Vectors, matrices, and transformations',
      },
      {
        title: 'Essence of Linear Algebra',
        provider: '3Blue1Brown',
        topic: 'Visual intuition for linear algebra',
      },
    ],
  },
  CAD: {
    topics: [
      'Parametric 2D and 3D modeling',
      'Engineering drawings and dimensioning',
      'Assemblies and constraints',
      'Tolerancing and design for manufacturing',
    ],
    resources: [
      {
        title: 'Fusion 360 for Beginners',
        provider: 'Autodesk',
        topic: 'Parametric CAD modeling',
      },
      {
        title: 'SolidWorks Tutorials',
        provider: 'SolidWorks',
        topic: '3D mechanical design',
      },
      {
        title: 'Engineering Graphics and Design',
        provider: 'MIT OpenCourseWare',
        topic: 'Technical drawing fundamentals',
      },
    ],
  },
  Thermodynamics: {
    topics: [
      'Laws of thermodynamics',
      'Heat transfer: conduction, convection, radiation',
      'Thermodynamic cycles and efficiency',
      'Entropy and energy conservation',
    ],
    resources: [
      {
        title: 'Thermodynamics',
        provider: 'MIT OpenCourseWare',
        topic: 'Energy, heat, and work',
      },
      {
        title: 'Thermodynamics Course',
        provider: 'Khan Academy',
        topic: 'Laws and cycles',
      },
      {
        title: 'Fundamentals of Engineering Thermodynamics',
        provider: 'Wiley',
        topic: 'Applied thermodynamic analysis',
      },
    ],
  },
  'Data Analysis': {
    topics: [
      'Data cleaning and preparation',
      'Exploratory data analysis',
      'Visualization and dashboards',
      'Drawing conclusions and communicating findings',
    ],
    resources: [
      {
        title: 'Data Analysis with Python',
        provider: 'freeCodeCamp',
        topic: 'Analyzing data with pandas',
      },
      {
        title: 'Google Data Analytics Certificate',
        provider: 'Coursera',
        topic: 'End-to-end data analysis workflow',
      },
      {
        title: 'Data Visualization Fundamentals',
        provider: 'Tableau',
        topic: 'Communicating data visually',
      },
    ],
  },
  'Field Work': {
    topics: [
      'Field sampling and data collection methods',
      'Using field instruments safely',
      'Recording observations and metadata',
      'Field safety and risk assessment',
    ],
    resources: [
      {
        title: 'Field Research Methods',
        provider: 'USGS',
        topic: 'Collecting environmental field data',
      },
      {
        title: 'Field Sampling Techniques',
        provider: 'EPA',
        topic: 'Sampling protocols and safety',
      },
      {
        title: 'Introduction to Field Ecology',
        provider: 'MIT OpenCourseWare',
        topic: 'Observation and measurement in the field',
      },
    ],
  },
  Policy: {
    topics: [
      'How policy is made and implemented',
      'Cost-benefit and impact analysis',
      'Stakeholder engagement',
      'Writing policy briefs and recommendations',
    ],
    resources: [
      {
        title: 'Public Policy Analysis',
        provider: 'University of Minnesota / Coursera',
        topic: 'Analyzing and evaluating policy',
      },
      {
        title: 'Environmental Policy and Governance',
        provider: 'edX',
        topic: 'Policy frameworks and regulation',
      },
      {
        title: 'How to Write a Policy Brief',
        provider: 'International Development Research Centre',
        topic: 'Communicating policy recommendations',
      },
    ],
  },
  'Threat Analysis': {
    topics: [
      'Threat modeling and attack surfaces',
      'Vulnerability assessment',
      'Risk scoring and prioritization',
      'Threat intelligence sources',
    ],
    resources: [
      {
        title: 'OWASP Threat Modeling',
        provider: 'OWASP',
        topic: 'Identifying and modeling threats',
      },
      {
        title: 'Introduction to Cyber Threat Intelligence',
        provider: 'Cybrary',
        topic: 'Analyzing adversary behavior',
      },
      {
        title: 'MITRE ATT&CK Framework',
        provider: 'MITRE',
        topic: 'Adversary tactics and techniques',
      },
    ],
  },
  Networking: {
    topics: [
      'OSI and TCP/IP models',
      'IP addressing and subnetting',
      'Routing and switching basics',
      'Network security fundamentals',
    ],
    resources: [
      {
        title: 'Computer Networking: A Top-Down Approach',
        provider: 'Pearson',
        topic: 'Networking fundamentals',
      },
      {
        title: 'Networking Essentials',
        provider: 'Cisco Networking Academy',
        topic: 'Protocols, routing, and switching',
      },
      {
        title: 'The Bits and Bytes of Computer Networking',
        provider: 'Google / Coursera',
        topic: 'How networks operate',
      },
    ],
  },
  'Incident Response': {
    topics: [
      'Incident response lifecycle',
      'Detection, containment, and eradication',
      'Digital forensics basics',
      'Post-incident review and lessons learned',
    ],
    resources: [
      {
        title: 'Computer Security Incident Handling Guide',
        provider: 'NIST',
        topic: 'Incident response process',
      },
      {
        title: 'Incident Response and Handling',
        provider: 'SANS Institute',
        topic: 'Responding to security incidents',
      },
      {
        title: 'Blue Team Fundamentals',
        provider: 'Cybrary',
        topic: 'Defensive operations and response',
      },
    ],
  },
  AWS: {
    topics: [
      'Core AWS services: EC2, S3, IAM, VPC',
      'AWS Well-Architected Framework',
      'Serverless with Lambda and API Gateway',
      'Monitoring and cost management',
    ],
    resources: [
      {
        title: 'AWS Cloud Practitioner Essentials',
        provider: 'AWS Skill Builder',
        topic: 'Foundational AWS concepts',
      },
      {
        title: 'AWS Well-Architected Framework',
        provider: 'Amazon Web Services',
        topic: 'Designing reliable cloud systems',
      },
      {
        title: 'AWS Certified Solutions Architect Course',
        provider: 'freeCodeCamp',
        topic: 'Architecting on AWS',
      },
    ],
  },
  'Cost Optimization': {
    topics: [
      'Cloud cost models and pricing',
      'Right-sizing and reserved capacity',
      'Tagging and cost allocation',
      'Monitoring spend and setting budgets',
    ],
    resources: [
      {
        title: 'AWS Cost Optimization',
        provider: 'AWS Skill Builder',
        topic: 'Reducing and managing cloud spend',
      },
      {
        title: 'Cloud FinOps',
        provider: "O'Reilly Media",
        topic: 'Financial management for the cloud',
      },
      {
        title: 'FinOps Foundation Introduction',
        provider: 'FinOps Foundation',
        topic: 'Cloud financial operations practices',
      },
    ],
  },
  'Mechanical Design': {
    topics: [
      'Mechanisms, linkages, and gears',
      'Material selection and properties',
      'Stress, strain, and factor of safety',
      'Design for assembly and manufacturing',
    ],
    resources: [
      {
        title: 'Mechanical Engineering: Design',
        provider: 'MIT OpenCourseWare',
        topic: 'Machine design fundamentals',
      },
      {
        title: 'Shigley\u2019s Mechanical Engineering Design',
        provider: 'McGraw Hill',
        topic: 'Component and system design',
      },
      {
        title: 'Introduction to Mechanical Design',
        provider: 'Coursera',
        topic: 'Designing mechanical components',
      },
    ],
  },
  'Control Systems': {
    topics: [
      'Open-loop vs. closed-loop control',
      'PID controllers and tuning',
      'Transfer functions and stability',
      'State-space representation',
    ],
    resources: [
      {
        title: 'Introduction to Control System Design',
        provider: 'MIT OpenCourseWare',
        topic: 'Feedback control fundamentals',
      },
      {
        title: 'Control Systems Lectures',
        provider: 'Brian Douglas',
        topic: 'Intuition for control theory',
      },
      {
        title: 'Control of Mobile Robots',
        provider: 'Georgia Tech / Coursera',
        topic: 'Applied control systems',
      },
    ],
  },
  Sensors: {
    topics: [
      'Sensor types and operating principles',
      'Signal conditioning and filtering',
      'Calibration and error sources',
      'Sensor fusion basics',
    ],
    resources: [
      {
        title: 'Sensors and Sensor Circuit Design',
        provider: 'Analog Devices',
        topic: 'Sensor fundamentals and interfacing',
      },
      {
        title: 'Introduction to Sensors',
        provider: 'edX',
        topic: 'Measurement and instrumentation',
      },
      {
        title: 'Arduino Sensor Projects',
        provider: 'Arduino',
        topic: 'Hands-on sensor experimentation',
      },
    ],
  },
  'Energy Systems': {
    topics: [
      'Electricity generation and the grid',
      'Renewable energy sources',
      'Energy storage technologies',
      'Energy efficiency and demand management',
    ],
    resources: [
      {
        title: 'Introduction to Power Systems',
        provider: 'MIT OpenCourseWare',
        topic: 'Generation, transmission, and distribution',
      },
      {
        title: 'Solar Energy Basics',
        provider: 'NREL',
        topic: 'Photovoltaic and solar systems',
      },
      {
        title: 'Renewable Energy and Green Building',
        provider: 'edX',
        topic: 'Clean energy systems',
      },
    ],
  },
  Modeling: {
    topics: [
      'Building mathematical and simulation models',
      'Assumptions, parameters, and validation',
      'Numerical methods and solvers',
      'Sensitivity analysis',
    ],
    resources: [
      {
        title: 'Introduction to Computational Thinking and Modeling',
        provider: 'MIT OpenCourseWare',
        topic: 'Modeling and simulation fundamentals',
      },
      {
        title: 'Model Thinking',
        provider: 'University of Michigan / Coursera',
        topic: 'Using models to understand systems',
      },
      {
        title: 'Simulation Modeling Basics',
        provider: 'MathWorks',
        topic: 'Building and validating simulations',
      },
    ],
  },
  'Environmental Awareness': {
    topics: [
      'Ecosystems and biodiversity',
      'Climate change science',
      'Sustainability and life-cycle thinking',
      'Environmental impact assessment',
    ],
    resources: [
      {
        title: 'Introduction to Environmental Science',
        provider: 'Dartmouth / edX',
        topic: 'Environmental systems and impact',
      },
      {
        title: 'Climate Change: The Science',
        provider: 'University of British Columbia / edX',
        topic: 'Climate science foundations',
      },
      {
        title: 'Sustainability Fundamentals',
        provider: 'Coursera',
        topic: 'Principles of sustainable development',
      },
    ],
  },
};

deepFreeze(skillResources);

export default skillResources;
