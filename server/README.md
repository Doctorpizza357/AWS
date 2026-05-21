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

