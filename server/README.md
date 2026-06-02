# 🖥️ STEM PathfindR — Backend Server

Express.js backend that acts as a secure proxy to AWS Bedrock. Handles SigV4-signed requests, PDF parsing, and all AI-powered endpoints. Keeps AWS credentials server-side — never exposed to the frontend.

---

## Requirements

- Node.js 18+
- npm
- AWS account with Bedrock access (IAM permissions for `bedrock:InvokeModel`)

---

## Installation

```bash
cd server
npm install
```

---

## Environment

Copy `.env.example` to `.env` and fill in values:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: `5000`) |
| `AWS_ACCESS_KEY_ID` | Yes | IAM access key with Bedrock invoke permissions |
| `AWS_SECRET_ACCESS_KEY` | Yes | IAM secret key |
| `AWS_SESSION_TOKEN` | No | For temporary/session credentials |
| `AWS_REGION` | No | AWS region (default: `us-east-1`) |
| `AWS_BEDROCK_MODEL_ID` | Yes | Bedrock model identifier (e.g. `anthropic.claude-3-5-sonnet-20241022-v2:0`) |

> **Security:** Ensure `server/.env` is in `.gitignore`. Never commit credentials.

---

## Running

```bash
# From the server/ directory
npm start

# Or from the project root
npm run server
```

Server starts at `http://localhost:5000`.

---

## API Endpoints

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Returns `{ ok: true, service: "pathfindr-backend" }` |

### AI Assistant
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/assistant/message` | Send a chat message, get AI career coach response |

Request: `{ "message": "How do I prepare for a cloud engineering role?" }`
Response: `{ "ok": true, "assistant": "..." }`

### Career Simulations
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/scenarios/generate` | Generate an AI-powered career scenario |

Request:
```json
{
  "career": { "title": "Software Engineer", "field": "Technology" },
  "scenario": { "title": "Critical Bug", "description": "..." },
  "userProfile": { "interests": ["Coding"], "skills": ["Problem Solving"] },
  "variation": "seed-string"
}
```

Response includes normalized scenario with `difficulty`, `rewardXp`, `options[]`, and `correctOptionId`.

### Resume Analysis (Onboarding)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/resume/analyze` | Upload PDF resume → extract career profile for onboarding |

- Upload via `multipart/form-data`, field name: `resume`
- Max file size: 5MB, PDF only
- Returns either `status: "complete"` with full profile, or `status: "incomplete"` with `extractedData` + `followUpQuestions`

### Interview Intelligence
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/interview/analyze-response` | Score an interview answer (technical accuracy, communication, depth, relevance) |
| POST | `/api/interview/generate-questions` | Generate 5 interview questions from a job description |
| POST | `/api/interview/analyze-resume` | ATS analysis: match score, missing keywords, improvements |
| POST | `/api/interview/generate-resume` | Generate an optimized resume targeting a specific job |
| POST | `/api/interview/extract-pdf` | Server-side PDF text extraction |
| POST | `/api/interview/code-review` | AI code review with scoring (correctness, efficiency, quality) |
| POST | `/api/interview/tailored-problems` | Generate 3 coding problems tailored to a job description |

---

## Architecture

```
Frontend (React) ──► Express Server ──► AWS Bedrock (Converse API)
                          │
                          ├── aws4 (SigV4 request signing)
                          ├── multer (PDF upload handling, in-memory)
                          └── pdf-parse (text extraction from PDFs)
```

Key design decisions:
- **SigV4 signing** via `aws4` — no SDK dependency, minimal footprint
- **Bedrock Converse API** — structured messages with system prompts
- **In-memory PDF handling** — no disk writes, files processed in RAM
- **Robust JSON parsing** — handles markdown fences, escaped newlines, truncated responses from the model
- **Scenario normalization** — consistent XP scaling (`easy`=10, `medium`=20, `hard`=30) and correct option marking

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 403 SigV4 error | Ensure signing `service` is `bedrock` and IAM credentials are correct |
| 404 model error | Model may be retired — update `AWS_BEDROCK_MODEL_ID` |
| 502 responses | Check server logs for Bedrock response body |
| Clock skew | Ensure machine clock is accurate (SigV4 requires correct time) |
| PDF extraction fails | File may be image-based (scanned). Use digital-text PDFs |
| Permission denied | IAM keys must have `bedrock:InvokeModel` in the configured region |

---

## Testing

```bash
# Health check
curl http://localhost:5000/health

# Chat assistant
curl -X POST http://localhost:5000/api/assistant/message \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello"}'

# Resume extraction
curl -X POST http://localhost:5000/api/resume/analyze \
  -F "resume=@/path/to/resume.pdf"
```

---

## Security Notes

- All AWS credentials stay in `server/.env`, never sent to the browser
- `multer` enforces 5MB file limit and PDF-only MIME type filtering
- Requests are signed per-call — no long-lived tokens cached
- Rotate keys immediately if exposed
