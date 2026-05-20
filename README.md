# 🧭 STEM PathFindr

> **Gamified STEM Career Discovery Platform — Built for the AWS Hackathon**

STEM PathFindr is an interactive web application that helps high school and college students discover their ideal STEM career through AI-powered simulations, real-time labor market data, and gamified exploration. Instead of reading about careers, students *live* them — making decisions in realistic day-in-the-life scenarios and seeing how their choices shape their professional path.

---

## 💡 Why We Built This

Students choosing a career path often rely on outdated guidance, vague descriptions, or word-of-mouth. They can't experience what a job *actually feels like* before committing years of education to it. Meanwhile, labor market conditions shift rapidly — salaries change, demand fluctuates, and entire fields emerge or decline.

STEM PathFindr combines:
- **AI-generated career simulations** (AWS Bedrock / Claude) that let students make real decisions in realistic scenarios
- **Live labor market intelligence** (Bureau of Labor Statistics API) so students see actual salary data, geographic demand, and career viability
- **Gamification** (XP, levels, badges) to keep students engaged and exploring

---

## ✨ Features

### 🎮 Interactive Career Simulations
- AI-powered day-in-the-life scenarios for each career path
- Branching decision points with meaningful outcomes
- Trait discovery based on choices (analytical, collaborative, leadership, etc.)
- Powered by **AWS Bedrock** (Claude 3.5 Sonnet) with intelligent fallbacks

### 📝 Personalized Onboarding Quiz
- 5-step quiz covering interests, skills, work style, and motivation
- AI-driven career matching algorithm
- Personalized career recommendations based on profile analysis

### 📊 Market Intelligence Dashboard
Real-time labor market data visualizations:
- **Market Pulse Heatmap** — Geographic demand by state (BLS Location Quotients)
- **Predictive Salary Arc** — Historical wages + 10-year projections with confidence intervals
- **Viability Index Radar** — 5-dimension career health analysis (AI displacement risk, capital inflow, supply/demand, wage growth, COLA-adjusted value)
- **Live Job Stream** — Real-time job listings (coming soon)

### 🏅 Gamification & Progress Tracking
- XP system with leveling
- Achievement badges (Quick Thinker, Team Player, Deep Diver, First Step, and more)
- Decision history tracking
- Progress persistence via Firebase

### 👤 User Profiles
- Google authentication via Firebase Auth
- Downloadable PDF profile reports (jsPDF)
- Skills visualization and progress stats
- Badge collection display

### 🗺️ Career Paths
Five fully-developed STEM career paths:
| Career | Field | Salary Range |
|--------|-------|-------------|
| 💻 Software Engineer | Technology | $85K – $180K |
| 📊 Data Scientist | Technology & Mathematics | $90K – $160K |
| 🧬 Biomedical Engineer | Engineering & Healthcare | $70K – $140K |
| 🚀 Aerospace Engineer | Engineering | $80K – $160K |
| 🌍 Environmental Scientist | Science | $60K – $120K |

Each career includes 3 unique simulation scenarios with multiple decision paths.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router 6, Framer Motion |
| AI Engine | AWS Bedrock (Claude 3.5 Sonnet) |
| Authentication | Firebase Auth (Google Sign-In) |
| Database | Firebase Firestore |
| Market Data | Bureau of Labor Statistics API v2 |
| Visualizations | Recharts, Chart.js, React Simple Maps, D3-Geo |
| PDF Export | jsPDF + jsPDF-AutoTable |
| Icons | Lucide React |
| Styling | Custom CSS with CSS variables, animations |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn
- Firebase project (for auth & database)
- AWS account with Bedrock access (for AI simulations)
- BLS API key (for market data — free at [bls.gov](https://data.bls.gov/registrationEngine/))

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd AWS

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
```

### Environment Variables

Edit `.env` with your credentials:

```env
# Firebase
REACT_APP_FIREBASE_API_KEY=your_api_key_here
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id

# AWS Bedrock (AI Simulations)
REACT_APP_AWS_BEARER_TOKEN=your_aws_token
REACT_APP_AWS_REGION=us-east-1
REACT_APP_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0

# Bureau of Labor Statistics
REACT_APP_BLS_API_KEY=your_bls_v2_key
```

### Running Locally

```bash
npm start
```

The app runs at `http://localhost:3000`. A proxy is configured for BLS API requests to avoid CORS issues in development.

### Building for Production

```bash
npm run build
```

---

## 📁 Project Structure

```
src/
├── assets/              # Static assets (logo, images)
├── components/
│   ├── market/          # Market Intelligence visualizations
│   │   ├── MarketPulseHeatmap.js
│   │   ├── PredictiveSalaryArc.js
│   │   ├── ViabilityIndexRadar.js
│   │   └── StreamMatrix.js
│   ├── CareerCard.js    # Career path card component
│   ├── Navbar.js        # Navigation bar
│   ├── ProgressBar.js   # XP progress indicator
│   ├── ProtectedRoute.js
│   └── DownloadProfileButton.js
├── context/
│   ├── AuthContext.js   # Firebase authentication state
│   ├── UserContext.js   # User profile & progress state
│   └── MarketIntelligenceContext.js
├── data/
│   ├── careers.js       # Career definitions & scenarios
│   └── badges.js        # Achievement badge definitions
├── pages/
│   ├── Landing.js       # Homepage / hero
│   ├── Login.js         # Authentication page
│   ├── Onboarding.js    # Quiz / profile setup
│   ├── Dashboard.js     # Main user dashboard
│   ├── CareerPath.js    # Individual career detail
│   ├── Simulation.js    # Interactive AI scenarios
│   ├── MarketIntelligence.js  # Market data dashboard
│   └── Profile.js       # User profile & settings
├── services/
│   ├── aiService.js     # AWS Bedrock integration
│   ├── firebase.js      # Firebase initialization
│   └── marketDataService.js   # BLS API integration
└── setupProxy.js        # Dev proxy for BLS API
```

---

## 🔑 Key AWS Integration

### AWS Bedrock (Claude 3.5 Sonnet)
- Generates dynamic, personalized career simulation scenarios
- Produces branching narratives with realistic decision points
- Adapts content based on student profile (interests, skills)
- Graceful fallback to curated scenarios when API is unavailable

The AI service uses the Bedrock Converse API with structured JSON prompts to ensure consistent, parseable responses that drive the simulation engine.

---

## 📈 Data Sources

- **Bureau of Labor Statistics (BLS) API v2** — Occupational Employment and Wage Statistics (OEWS), CPI-U inflation data
- **SOC Codes** — Standard Occupational Classification for precise career data mapping
- **State-level FIPS codes** — Geographic employment distribution

All market data is fetched live and projected forward using compound annual growth rates (CAGR) derived from historical observations.

---

## 🎯 How It Works

1. **Onboard** — Student takes a 5-step quiz about interests, skills, and preferences
2. **Discover** — AI matches them with personalized career recommendations
3. **Explore** — Browse career paths with salary data, growth projections, and required skills
4. **Simulate** — Enter immersive AI-generated scenarios and make real decisions
5. **Analyze** — View live market intelligence (salary trends, geographic demand, viability)
6. **Progress** — Earn XP, level up, collect badges, and refine career direction

---

## 📄 License

This project was created for the AWS Hackathon.
