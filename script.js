const careerProfiles = {
  "Software Engineer": {
    tags: ["coding", "python", "math", "gaming", "ai", "app", "technology", "robotics"],
    actions: ["Build 2 portfolio apps", "Practice data structures", "Join open source projects"],
    skills: [88, 72, 90]
  },
  "Data Scientist": {
    tags: ["data", "statistics", "ai", "research", "math", "analytics", "python", "healthcare"],
    actions: ["Learn SQL and Python", "Complete one ML project", "Study experimentation methods"],
    skills: [84, 92, 78]
  },
  "Cybersecurity Analyst": {
    tags: ["security", "cyber", "gaming", "networks", "forensics", "problem solving", "technology"],
    actions: ["Get security fundamentals cert", "Practice CTF challenges", "Learn cloud security basics"],
    skills: [79, 81, 86]
  },
  "Biomedical Engineer": {
    tags: ["healthcare", "biology", "chemistry", "research", "devices", "impact", "volunteering"],
    actions: ["Take anatomy and circuits", "Prototype a medical device idea", "Connect with hospital innovation labs"],
    skills: [76, 85, 74]
  },
  "Environmental Engineer": {
    tags: ["climate", "sustainability", "environment", "chemistry", "earth", "impact", "policy"],
    actions: ["Study GIS and modeling", "Volunteer in sustainability projects", "Build a climate data dashboard"],
    skills: [74, 80, 77]
  },
  "Robotics Engineer": {
    tags: ["robotics", "hardware", "electronics", "coding", "automation", "math", "design"],
    actions: ["Learn CAD and embedded systems", "Join robotics competitions", "Create a sensor-based prototype"],
    skills: [86, 76, 88]
  }
};

const opportunityMap = {
  "Software Engineer": {
    jobs: [
      { title: "Junior Full Stack Developer", org: "TechBridge Labs", mode: "Remote" },
      { title: "Cloud Application Engineer Intern", org: "Nimbus Systems", mode: "Hybrid" }
    ],
    mentors: [
      { name: "Priya K.", area: "Backend Systems", org: "AWS Partner Network" },
      { name: "Luis A.", area: "Developer Experience", org: "Startup Mentor Guild" }
    ]
  },
  "Data Scientist": {
    jobs: [
      { title: "Data Science Intern", org: "HealthMetrics AI", mode: "Remote" },
      { title: "Analytics Associate", org: "GreenGrid Insights", mode: "On-site" }
    ],
    mentors: [
      { name: "Mina S.", area: "ML in Healthcare", org: "Women in Data" },
      { name: "Daniel R.", area: "Experiment Design", org: "Insight Collective" }
    ]
  },
  "Cybersecurity Analyst": {
    jobs: [
      { title: "SOC Analyst I", org: "SecurePath", mode: "Hybrid" },
      { title: "Cloud Security Intern", org: "ShieldOps", mode: "Remote" }
    ],
    mentors: [
      { name: "Abel T.", area: "Threat Detection", org: "Cyber Futures" },
      { name: "Nora L.", area: "Incident Response", org: "Security Bridge" }
    ]
  },
  "Biomedical Engineer": {
    jobs: [
      { title: "Medical Device R&D Intern", org: "VitalMotion", mode: "On-site" },
      { title: "Clinical Engineering Assistant", org: "Metro Health", mode: "Hybrid" }
    ],
    mentors: [
      { name: "Elena M.", area: "Device Validation", org: "BioMentor Network" },
      { name: "Haruto Y.", area: "Biomechanics", org: "Research Fellows Hub" }
    ]
  },
  "Environmental Engineer": {
    jobs: [
      { title: "Sustainability Analyst", org: "Earthwise Consulting", mode: "Hybrid" },
      { title: "Water Systems Intern", org: "BluePlanet Utility", mode: "On-site" }
    ],
    mentors: [
      { name: "Sara P.", area: "Climate Data", org: "Eco Innovators" },
      { name: "Rohit N.", area: "Clean Infrastructure", org: "Global Green Alliance" }
    ]
  },
  "Robotics Engineer": {
    jobs: [
      { title: "Automation Engineer Intern", org: "MotionFoundry", mode: "On-site" },
      { title: "Robotics Software Associate", org: "AstraBots", mode: "Hybrid" }
    ],
    mentors: [
      { name: "Joan C.", area: "Autonomous Systems", org: "Robotics Circle" },
      { name: "Khalid B.", area: "Embedded Controls", org: "Maker Mentor Club" }
    ]
  }
};

const questionSlides = [
  {
    key: "fullName",
    shortTitle: "Preferred name",
    helper: "This personalizes the dashboard.",
    explain: "Use the name you want the experience to show throughout the journey.",
    example: "Alex Rivera",
    advice: "Use the name you would want on a certificate or portfolio.",
    followUp: "If you are unsure, pick the name people usually use for you."
  },
  {
    key: "education",
    shortTitle: "Education stage",
    helper: "This sets the tone for the recommendations.",
    explain: "We use this to adjust the depth of examples and next steps.",
    example: "Undergraduate",
    advice: "Choose the option that best matches your current stage, not where you hope to be later.",
    followUp: "If you are switching paths, choose the level that reflects your current learning situation."
  },
  {
    key: "hobbies",
    shortTitle: "Hobbies",
    helper: "These show what you naturally spend time on.",
    explain: "Hobbies help surface patterns in curiosity, problem solving, and creativity.",
    example: "Robotics club, gaming, drawing, volunteering",
    advice: "Include things you choose to do when you have free time, not only formal classes.",
    followUp: "A mix of creative and technical hobbies often gives the best signal."
  },
  {
    key: "interests",
    shortTitle: "Interests",
    helper: "These point to the topics you care about.",
    explain: "We use these to match you with STEM fields and real-world problems.",
    example: "AI, climate, healthcare, cybersecurity",
    advice: "Think about themes you would read about even without being assigned to.",
    followUp: "If a topic keeps showing up in your conversations or side projects, it belongs here."
  },
  {
    key: "skills",
    shortTitle: "Skills",
    helper: "These can be technical or human skills.",
    explain: "Skills help us see where you already have momentum.",
    example: "Python, teamwork, public speaking, math",
    advice: "Mix technical strengths with communication, leadership, or problem solving.",
    followUp: "Do not worry about listing everything; just include the strongest signals.",
  },
  {
    key: "careerGoal",
    shortTitle: "Career goal",
    helper: "This gives the recommendations a direction.",
    explain: "Your goal helps the assistant prioritize the kind of impact you want to make.",
    example: "Build tools that make healthcare more accessible",
    advice: "Focus on the change you want to create, not only the job title.",
    followUp: "A clear outcome is more useful than a perfect sentence."
  }
];

const profileForm = document.querySelector("#profile-form");
const stepTwo = document.querySelector("#step-2");
const stepThree = document.querySelector("#step-3");
const topCareersEl = document.querySelector("#top-careers");
const actionPlanEl = document.querySelector("#action-plan");
const profileSummaryEl = document.querySelector("#profile-summary");
const jobsListEl = document.querySelector("#jobs-list");
const mentorsListEl = document.querySelector("#mentors-list");
const aiOutputEl = document.querySelector("#ai-output");
const refreshAiButton = document.querySelector("#refresh-ai");
const slideContainerEl = document.querySelector("#slides");
const slideElements = Array.from(document.querySelectorAll(".slide"));
const slideCounterEl = document.querySelector("#slide-counter");
const progressFillEl = document.querySelector("#progress-fill");
const prevQuestionButton = document.querySelector("#prev-question");
const nextQuestionButton = document.querySelector("#next-question");
const finishQuizButton = document.querySelector("#finish-quiz");
const assistantContextEl = document.querySelector("#assistant-context");
const assistantResponseEl = document.querySelector("#assistant-response");
const assistantQueryEl = document.querySelector("#assistant-query");
const assistantSendButton = document.querySelector("#assistant-send");
const assistantActionButtons = Array.from(document.querySelectorAll(".assistant-chip"));
const assistantDock = document.querySelector(".assistant-dock");
const themeToggleButton = document.querySelector("#theme-toggle");

let scoreChart;
let skillChart;
let latestResults = [];
let latestProfile = null;
let currentSlideIndex = 0;

function getPreferredTheme() {
  const savedTheme = window.localStorage.getItem("theme-mode");

  if (savedTheme === "dark" || savedTheme === "light") {
    return savedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggleButton.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  themeToggleButton.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  window.localStorage.setItem("theme-mode", theme);
}

function normalizeInput(value) {
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function titleCase(value) {
  return value
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSummaryValue(value) {
  return titleCase(String(value || "")) || "Not shared";
}

function truncate(value, length) {
  if (!value) {
    return "";
  }

  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function scoreCareers(tokens) {
  const scored = Object.entries(careerProfiles).map(([career, profile]) => {
    const matches = profile.tags.filter((tag) => tokens.includes(tag)).length;
    const randomBoost = Math.floor(Math.random() * 9);
    const score = Math.min(99, 58 + matches * 8 + randomBoost);

    return { career, score, matches, profile };
  });

  return scored.sort((left, right) => right.score - left.score);
}

function renderSummary(profile) {
  const items = [
    { label: "Candidate", value: profile.fullName },
    { label: "Education", value: formatSummaryValue(profile.education) },
    { label: "Hobbies", value: String(profile.hobbies.length) },
    { label: "Interests", value: String(profile.interests.length) },
    { label: "Goal", value: truncate(profile.careerGoal || "Open-ended", 36) }
  ];

  profileSummaryEl.innerHTML = items
    .map(
      (item) => `
        <article class="summary-item">
          <div class="label">${item.label}</div>
          <div class="value">${item.value}</div>
        </article>
      `
    )
    .join("");
}

function renderTopCareers(results) {
  topCareersEl.innerHTML = results
    .slice(0, 5)
    .map((result) => `<li>${result.career} - <strong>${result.score}% match</strong></li>`)
    .join("");
}

function renderActionPlan(results) {
  const actions = results[0]?.profile.actions ?? [];
  actionPlanEl.innerHTML = actions.length
    ? actions.map((action) => `<li>${action}</li>`).join("")
    : `<li>No action plan yet.</li>`;
}

function renderCharts(results) {
  const labels = results.slice(0, 5).map((result) => result.career);
  const scores = results.slice(0, 5).map((result) => result.score);
  const skillSet = results[0]?.profile.skills ?? [75, 75, 75];

  if (scoreChart) {
    scoreChart.destroy();
  }

  if (skillChart) {
    skillChart.destroy();
  }

  scoreChart = new Chart(document.querySelector("#scoreChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Career Match %",
          data: scores,
          borderRadius: 10,
          backgroundColor: ["#0b6e4f", "#d95f02", "#2f4fb0", "#4f7a16", "#6f3eb5"]
        }
      ]
    },
    options: {
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100
        }
      }
    }
  });

  skillChart = new Chart(document.querySelector("#skillChart"), {
    type: "radar",
    data: {
      labels: ["Technical", "Domain Knowledge", "Communication"],
      datasets: [
        {
          label: `${results[0].career} readiness`,
          data: skillSet,
          borderColor: "#2f4fb0",
          backgroundColor: "rgba(47, 79, 176, 0.18)",
          pointBackgroundColor: "#2f4fb0"
        }
      ]
    },
    options: {
      scales: {
        r: {
          suggestedMin: 0,
          suggestedMax: 100,
          angleLines: { color: "#cad4d8" },
          grid: { color: "#dce5e8" }
        }
      }
    }
  });
}

function renderOpportunities(primaryCareer) {
  const opportunities = opportunityMap[primaryCareer] || {
    jobs: [],
    mentors: []
  };

  jobsListEl.innerHTML = opportunities.jobs.length
    ? opportunities.jobs
        .map(
          (job) => `
            <article class="stack-item">
              <div class="title">${job.title}</div>
              <div class="meta">${job.org} | ${job.mode}</div>
            </article>
          `
        )
        .join("")
    : `<article class="stack-item"><div class="title">No jobs yet</div><div class="meta">Try another profile.</div></article>`;

  mentorsListEl.innerHTML = opportunities.mentors.length
    ? opportunities.mentors
        .map(
          (mentor) => `
            <article class="stack-item">
              <div class="title">${mentor.name}</div>
              <div class="meta">${mentor.area} | ${mentor.org}</div>
            </article>
          `
        )
        .join("")
    : `<article class="stack-item"><div class="title">No mentors yet</div><div class="meta">Try another profile.</div></article>`;
}

function getSlideConfig(index) {
  return questionSlides[index] || questionSlides[0];
}

function getCurrentControl() {
  const slide = slideElements[currentSlideIndex];
  return slide ? slide.querySelector("input, select, textarea") : null;
}

function isCurrentSlideComplete() {
  const control = getCurrentControl();

  if (!control) {
    return true;
  }

  const value = String(control.value || "").trim();
  if (control.required) {
    return value.length > 0 && control.checkValidity();
  }

  return true;
}

function renderAssistantContext() {
  const question = getSlideConfig(currentSlideIndex);

  assistantContextEl.innerHTML = `
    <article class="assistant-context-card">
      <div class="context-kicker">Current slide</div>
      <h3>${question.shortTitle}</h3>
      <p>${question.helper}</p>
      <div class="context-tags">
        <span>${question.example}</span>
        <span>${question.followUp}</span>
      </div>
    </article>
  `;
}

function buildAssistantReply(mode, customPrompt = "") {
  const question = getSlideConfig(currentSlideIndex);
  const prompt = customPrompt.trim();
  let response = question.explain;

  if (mode === "example") {
    response = question.example;
  } else if (mode === "advice") {
    response = question.advice;
  }

  if (prompt) {
    response = `${response} You asked: "${prompt}". ${question.followUp}`;
  }

  return response;
}

function renderAssistantReply(mode, customPrompt = "") {
  assistantResponseEl.textContent = buildAssistantReply(mode, customPrompt);
}

function updateSlideState(index) {
  const maxIndex = slideElements.length - 1;
  currentSlideIndex = Math.max(0, Math.min(index, maxIndex));

  slideContainerEl.style.transform = `translateX(-${currentSlideIndex * 100}%)`;
  slideCounterEl.textContent = `${currentSlideIndex + 1} of ${slideElements.length}`;
  progressFillEl.style.width = `${((currentSlideIndex + 1) / slideElements.length) * 100}%`;

  prevQuestionButton.disabled = currentSlideIndex === 0;
  nextQuestionButton.classList.toggle("hidden", currentSlideIndex === maxIndex);
  finishQuizButton.classList.toggle("hidden", currentSlideIndex !== maxIndex);
  nextQuestionButton.disabled = false;
  finishQuizButton.disabled = false;

  if (assistantDock) {
    assistantDock.open = true;
  }

  renderAssistantContext();
  renderAssistantReply("explain");

  const control = getCurrentControl();
  if (control) {
    window.setTimeout(() => control.focus(), 0);
  }
}

function goToNextSlide() {
  const control = getCurrentControl();
  if (control && !isCurrentSlideComplete()) {
    control.reportValidity();
    return;
  }

  if (currentSlideIndex < slideElements.length - 1) {
    updateSlideState(currentSlideIndex + 1);
  }
}

function goToPreviousSlide() {
  if (currentSlideIndex > 0) {
    updateSlideState(currentSlideIndex - 1);
  }
}

function generateAiTemplateAdvice() {
  if (!latestProfile || latestResults.length === 0) {
    aiOutputEl.textContent = "Answer the quiz to generate a mock AI summary and coaching prompt.";
    return;
  }

  const top = latestResults[0];
  const second = latestResults[1];
  const focusSkill = ["technical depth", "communication", "domain storytelling"][
    Math.floor(Math.random() * 3)
  ];

  aiOutputEl.textContent = `AI Draft for ${latestProfile.fullName}: Your strongest pathway is ${top.career} (${top.score}% match), with ${second?.career || "a second option"} as a backup. Over the next 6 weeks, focus on ${focusSkill}, complete one project related to ${latestProfile.interests[0] || "your favorite domain"}, and connect with 2 mentors. Future integration: send this profile to AWS Bedrock (Claude) for personalized guidance.`;
}

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const form = new FormData(profileForm);
  const profile = {
    fullName: String(form.get("fullName") || "Candidate"),
    education: String(form.get("education") || "Not selected"),
    hobbies: normalizeInput(String(form.get("hobbies") || "")),
    interests: normalizeInput(String(form.get("interests") || "")),
    skills: normalizeInput(String(form.get("skills") || "")),
    careerGoal: String(form.get("careerGoal") || "")
  };

  const allTokens = [...profile.hobbies, ...profile.interests, ...profile.skills];
  const results = scoreCareers(allTokens);

  latestProfile = profile;
  latestResults = results;

  renderSummary(profile);
  renderTopCareers(results);
  renderActionPlan(results);
  renderCharts(results);
  renderOpportunities(results[0].career);
  generateAiTemplateAdvice();

  if (assistantDock) {
    assistantDock.open = false;
  }

  stepTwo.classList.remove("hidden");
  stepThree.classList.remove("hidden");
  stepTwo.scrollIntoView({ behavior: "smooth", block: "start" });
});

profileForm.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && currentSlideIndex < slideElements.length - 1) {
    const control = getCurrentControl();
    if (control && control.tagName !== "TEXTAREA") {
      event.preventDefault();
      goToNextSlide();
    }
  }
});

prevQuestionButton.addEventListener("click", goToPreviousSlide);
nextQuestionButton.addEventListener("click", goToNextSlide);

assistantActionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    renderAssistantReply(button.dataset.assist || "explain", assistantQueryEl.value);
  });
});

assistantSendButton.addEventListener("click", () => {
  const prompt = assistantQueryEl.value.trim();
  renderAssistantReply("explain", prompt);
  assistantQueryEl.value = "";
});

assistantQueryEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    assistantSendButton.click();
  }
});

refreshAiButton.addEventListener("click", generateAiTemplateAdvice);

themeToggleButton.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
});

applyTheme(getPreferredTheme());
updateSlideState(0);
