# STEM PathfindR — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            CLIENT (Browser)                             │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  React 18   │  │TensorFlow.js│  │   Pyodide   │  │  pdfjs-dist │     │
│  │  SPA + PWA  │  │   MoveNet   │  │ Python WASM │  │ PDF Extract │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                 │                 │          │
│         │     In-browser ML (no server)    │    In-browser   │          │
│         │                │                 │    execution    │          │
└─────────┼────────────────┼─────────────────┼─────────────────┼──────────┘
          │                │                 │                 │
          ▼                ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            NETWORK LAYER                                │
│                                                                         │
│  /api/*        ──────────► Express Backend (port 5000)                  │
│  /api/bls/     ──────────► CRA Proxy → BLS API v2                       │
│  Firebase SDK  ──────────► Firebase Auth + Firestore (direct)           │
│  CDN loads     ──────────► TF.js models, Pyodide runtime                │
└─────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       EXPRESS BACKEND (server/)                         │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │    aws4     │  │   multer    │  │  pdf-parse  │  │    JSON     │     │
│  │ SigV4 sign  │  │  PDF upload │  │ text extract│  │ parse/norm  │     │
│  └──────┬──────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
│         │                                                               │
│         │  Signed HTTPS requests                                        │
└─────────┼───────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             AWS BEDROCK                                 │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Claude 3.5 Sonnet (Converse API)                                 │  │
│  │                                                                   │  │
│  │  System Prompts:                                                  │  │
│  │    • Career Assistant persona (chat)                              │  │
│  │    • Scenario generation engine (simulations)                     │  │
│  │    • Resume analysis engine (onboarding)                          │  │
│  │    • Interview coach (mock interview + code review)               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### 1. Career Simulation Flow

```
User clicks "Start Scenario"
        │
        ▼
┌────────────────┐    POST /api/scenarios/generate    ┌────────────────┐
│ Simulation.js  │ ─────────────────────────────────► │    Express     │
│ (React page)   │                                    │    Backend     │
└───────┬────────┘                                    └───────┬────────┘
        │                                                     │
        │                                            SigV4-signed request
        │                                                     │
        │                                                     ▼
        │                                             ┌────────────────┐
        │                                             │  AWS Bedrock   │
        │                                             │  Claude 3.5    │
        │                                             └───────┬────────┘
        │                                                     │
        │                                            JSON scenario response
        │                                                     │
        │        Normalized scenario                  ┌───────▼────────┐
        │◄─────── (difficulty, XP, options,  ◄────────│  Normalize &   │
        │          correctOptionId)                   │  Parse JSON    │
        ▼                                             └────────────────┘
┌────────────────┐
│  User makes    │
│  decision      │
└───────┬────────┘
        │
        ▼
┌────────────────┐     setDoc (merge)       ┌────────────────┐
│  UserContext   │ ──────────────────────►  │   Firestore    │
│  addXP, badge, │                          │  users/{uid}   │
│  completeScene │                          └────────────────┘
└────────────────┘
```

### 2. Market Intelligence Flow

```
┌────────────────────┐
│ MarketIntelligence │
│      Context       │  selectCareer(id)
└─────────┬──────────┘
          │
          │  Promise.allSettled (parallel)
          │
          ├──► fetchHeatmapData(id)   ──► BLS API v2 (state LQ + wage, 20 series)
          ├──► fetchSalaryData(id)    ──► BLS API v2 (p10/p25/median/p75/p90)
          └──► fetchViabilityData(id) ──► BLS API v2 (employment + wage + CPI-U)
                                                │
                                                ▼
                                      ┌──────────────────┐
                                      │  BLS Public API  │
                                      │  v2 (POST)       │
                                      │  via CRA proxy   │
                                      └────────┬─────────┘
                                               │
                                      Raw OEWS + CPI data
                                               │
                                               ▼
                                      ┌──────────────────┐
                                      │  Client-side     │
                                      │  CAGR projection │
                                      │  + derivation    │
                                      └────────┬─────────┘
                                               │
                                ┌──────────────┼──────────────┐
                                ▼              ▼              ▼
                         ┌───────────┐  ┌───────────┐  ┌───────────┐
                         │  Heatmap  │  │Salary Arc │  │ Viability │
                         │ (US map)  │  │ (chart)   │  │ (radar)   │
                         └───────────┘  └───────────┘  └───────────┘
```

### 3. Interview Intelligence Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                   Interview Intelligence Suite                     │
└────────────────────────────────────────────────────────────────────┘

  ┌────────────────┐       ┌────────────────┐       ┌────────────────┐
  │  Smart Resume  │       │ Mock Interview │       │   Technical    │
  │     Engine     │       │    (Video)     │       │   Assessment   │
  └───────┬────────┘       └───────┬────────┘       └───────┬────────┘
          │                        │                         │
  Upload PDF resume         Start recording            Write code
          │                        │                         │
          ▼                        ▼                         ▼
  ┌────────────────┐    ┌─────────────────┐    ┌─────────────────────┐
  │ /api/interview │    │ Web Speech API  │    │  In-browser eval    │
  │  extract-pdf   │    │ (transcription) │    │  (JS) or Pyodide    │
  │  analyze-resume│    │                 │    │  (Python WASM)      │
  │  generate-resume│   │ TensorFlow.js   │    └──────────┬──────────┘
  └───────┬────────┘    │ MoveNet (pose)  │               │
          │             └───────┬─────────┘               │
          │                     │                         │
          ▼                     ▼                         ▼
  ┌────────────────┐    ┌────────────────┐    ┌─────────────────────┐
  │ Bedrock:       │    │ Bedrock:       │    │ Bedrock:            │
  │  ATS scoring   │    │  Response      │    │  Code review        │
  │  Keyword gaps  │    │   analysis     │    │  Complexity         │
  │  Optimized     │    │  Follow-ups    │    │  Suggestions        │
  │   resume       │    │  Scoring       │    │                     │
  └────────────────┘    └────────────────┘    └─────────────────────┘
```

---

## Component Architecture

### React Context Providers (top-down)

```
<AuthProvider>                ← Firebase Auth state
  <Router>
    <UserProvider>            ← User profile, XP, badges, Firestore sync
      <InterviewProvider>     ← Interview session state (resume, questions)
        <App>
          <MarketIntelligenceProvider>   ← Lazy: only on /market-intelligence
            <MarketIntelligence />
          </MarketIntelligenceProvider>
        </App>
      </InterviewProvider>
    </UserProvider>
  </Router>
</AuthProvider>
```

### State Persistence Strategy

```
┌─────────────┐       ┌──────────────┐       ┌──────────────┐
│   React     │ ────► │ localStorage │ ────► │  Firestore   │
│   State     │       │  (offline)   │       │   (sync)     │
└─────────────┘       └──────────────┘       └──────────────┘

• Auth state:          Firebase SDK manages tokens/sessions
• User profile:        Written to Firestore on change, cached in localStorage
• Interview sessions:  localStorage only (no cloud sync)
• Market data:         Fetched live on each visit (no caching — always fresh)
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  BROWSER (untrusted)                    │
│                                                         │
│  • No AWS credentials                                   │
│  • No BLS API key in network requests (proxied)         │
│  • Firebase Auth tokens managed by SDK                  │
│  • TensorFlow.js runs locally (no data sent)            │
└──────────────────────────┬──────────────────────────────┘
                           │
                      HTTPS only
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│               EXPRESS BACKEND (trusted)                 │
│                                                         │
│  • AWS credentials in .env (never sent to client)       │
│  • SigV4 signing per-request (no cached tokens)         │
│  • multer: 5MB limit + PDF MIME enforcement             │
│  • No persistent file storage (memory-only processing)  │
│  • CORS enabled for local development                   │
└──────────────────────────┬──────────────────────────────┘
                           │
                      SigV4-signed HTTPS
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      AWS BEDROCK                        │
│                                                         │
│  • IAM-scoped permissions (bedrock:InvokeModel only)    │
│  • Regional endpoint (us-east-1)                        │
│  • Request-level authentication                         │
└─────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| SigV4 via `aws4` (no AWS SDK) | Minimal server footprint, no SDK bloat for a single API call |
| CRA proxy for BLS API | Avoids CORS without a custom backend route; BLS API has no CORS headers |
| TensorFlow.js in-browser | Privacy-first: video/pose data never leaves the user's device |
| Pyodide for Python | Zero backend cost for code execution; sandboxed WASM runtime |
| Firestore over DynamoDB | Faster auth integration (same Firebase project), real-time listeners, simpler for hackathon scope |
| localStorage + Firestore | Offline-first UX with eventual cloud sync; handles network drops gracefully |
| Lazy loading (React.lazy) | Market Intelligence, Interview suite loaded on-demand to keep initial bundle small |
| Fallback scenarios | If Bedrock is unavailable, curated scenarios ensure the app still works |

---

## Deployment Considerations

```
Production Architecture (recommended):

┌──────────┐       ┌───────────────┐       ┌──────────────┐
│   S3 +   │       │ API Gateway   │       │    Lambda    │
│CloudFront│       │  + Lambda     │       │  (or ECS)    │
│ (React)  │       │   /api/*      │       │ Express app  │
└──────────┘       └───────────────┘       └──────┬───────┘
                                                   │
                                            ┌──────▼───────┐
                                            │   Bedrock    │
                                            │  (us-east-1) │
                                            └──────────────┘
```

- **Frontend:** S3 + CloudFront (static hosting, global CDN)
- **Backend:** Lambda behind API Gateway (or ECS Fargate for persistent connections)
- **Auth:** Firebase Auth (cross-platform, already configured)
- **Database:** Firestore (or migrate to DynamoDB for full AWS stack)
- **Secrets:** AWS Secrets Manager or SSM Parameter Store
