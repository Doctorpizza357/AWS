# Pathfindr Backend (Express)

Lightweight local proxy that forwards assistant requests to AWS Bedrock using SigV4-signed requests. Keep secrets on the server — do NOT put AWS credentials into the frontend.

## Requirements
- Node.js 18+ and npm

## Installation
From the `server` folder:

```bash
npm install
npm start
```

Or from the repo root (if present):

```bash
npm run server
```

## Environment
Copy `.env.example` to `.env` and fill in values. Important variables:

- `AWS_REGION` (default: `us-east-1`)
- `AWS_BEDROCK_MODEL_ID` (required) — use a currently supported Bedrock model/version
- `AWS_ACCESS_KEY_ID` (required for SigV4)
- `AWS_SECRET_ACCESS_KEY` (required for SigV4)
- `AWS_SESSION_TOKEN` (optional, for temporary credentials)
- `PORT` (optional, defaults to `5000`)

Make sure `server/.env` is listed in `.gitignore` and never commit it.

## Endpoints

- `GET /health` — returns basic service health. Example response: `{ ok: true, service: 'pathfindr-backend' }`
- `POST /api/assistant/message` — send user text and receive assistant reply.

### New Endpoints

- `POST /api/scenarios/generate` — Generate an AI-powered scenario for a career path. Request body (JSON):

```json
{
	"career": { "title": "Software Engineer", "field": "Technology" },
	"scenario": { "title": "On-call outage", "description": "..." },
	"userProfile": { "interests": ["Coding & Programming"], "skills": ["Problem Solving"] },
	"variation": "seed-1"
}
```

Response: normalized JSON scenario including `difficulty`, `rewardXp`, `options`, and `correctOptionId`.

- `POST /api/resume/analyze` — Analyze a PDF resume and extract a structured career profile.

Requirements and notes:
- Upload via `multipart/form-data` with field name `resume` (PDF only). The server enforces a 5MB file size limit.
- The server uses `multer` (memory storage) and `pdf-parse` to extract text. Scanned image PDFs may not return usable text; prefer digital-text PDFs.
- The analysis response is strict JSON indicating `status: "complete"` with a `profile`, or `status: "incomplete"` with `extractedData` and `followUpQuestions` (max 3 follow-ups) to drive the onboarding quiz.

Example curl (resume analysis):

```bash
curl -X POST http://localhost:5000/api/resume/analyze \
	-F "resume=@/path/to/resume.pdf"
```

Request body (JSON):

```json
{ "message": "How do I prepare for a cloud engineering role?" }
```

Successful response (JSON):

```json
{ "ok": true, "assistant": "...assistant text..." }
```

Error responses include helpful diagnostics from Bedrock (status/body) when available.

## Troubleshooting

- 403 SigV4 error: ensure signing `service` is `bedrock` and IAM credentials are correct.
- 404 model error: a model/version may be retired — update `AWS_BEDROCK_MODEL_ID` to a supported model.
- 502 responses: check the server logs for Bedrock response body to see why the request failed.
- Clock skew: ensure your machine's clock is accurate (SigV4 requires correct time).
- Permissions: IAM keys must have Bedrock invoke permissions in the configured region.

## Testing
Simple curl test (replace port and message):

```bash
curl -X POST http://localhost:5000/api/assistant/message \
	-H "Content-Type: application/json" \
	-d '{"message":"Hello"}'
```

## Security
- Keep keys in `server/.env` and out of version control. Rotate keys if they are ever exposed.

## Notes
- The server signs requests and forwards them to the Bedrock runtime endpoint. If you change the model or region, restart the server.

## Implementation details
- Uses `aws4` for SigV4 signing of Bedrock requests and `node-fetch` (or global `fetch`) to call Bedrock's Converse endpoint.
- Robust `pdf-parse` handling supports multiple module export shapes so the server works with different package versions.
- Scenario prompt construction and response parsing include helper functions to normalize difficulty, scale XP, and extract JSON from model responses even when the model includes small formatting noise.

