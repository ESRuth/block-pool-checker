# Deploying

Live: Cloud Run service `block-pool-checker`, project `block-pool-checker`, region `us-east1` (never use any other gcloud project). One image holds the API and the built web app (`Dockerfile`).

## Run locally
`pnpm --filter @bpc/api dev` runs in memory (no `GCP_PROJECT`): sheets vanish on restart, the API is open and every caller is the owner. Add `INVITE_CODE=testcode` to test access control, `READER=stub` to avoid model calls. `docker build -t bpc . && docker run -p 8080:8080 bpc` runs the production image.

## Before you deploy
CI runs lint, format, typecheck, unit and e2e tests on every push (`.github/workflows/ci.yml`). Locally: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`.

## Deploy
From the repo root (the owner code is in `.env` as `INVITE_CODE_PROD`; it is not written down anywhere else):
```bash
set -a; . ./.env; set +a
gcloud run deploy block-pool-checker --source . --project block-pool-checker --region us-east1 \
  --service-account bpc-api@block-pool-checker.iam.gserviceaccount.com --allow-unauthenticated \
  --max-instances 3 --memory 512Mi --quiet \
  --set-env-vars "GCP_PROJECT=block-pool-checker,GOOGLE_CLOUD_PROJECT=block-pool-checker,PHOTO_BUCKET=block-pool-checker-photos,INVITE_CODE=$INVITE_CODE_PROD"
```
It takes a few minutes. Check it with `gcloud run services describe block-pool-checker --project block-pool-checker --region us-east1 --format="value(status.latestReadyRevisionName,status.traffic[0].percent)"` and `GET /api/health` (Cloud Run reserves `/healthz`).

## Environment variables
| Variable | Meaning |
| --- | --- |
| `GCP_PROJECT` | Set = use Firestore and Cloud Storage; unset = in memory. The server refuses to start with it set and no `INVITE_CODE`. |
| `GOOGLE_CLOUD_PROJECT` | Project for Vertex AI (Gemini). Unset = photo reading is off. |
| `PHOTO_BUCKET` | Private bucket for sheet photos (`sheets/<id>.jpg`). |
| `INVITE_CODE` | The owner's master code. Anyone presenting it (header `X-Invite-Code`) is the owner. With `GCP_PROJECT` set it must be at least 20 characters (generate one with `openssl rand -base64url 24`); there is no failed-attempt limit, so length is the protection. Personal keys are 120 random bits and need no change. To rotate it, change `INVITE_CODE_PROD` in `.env` and redeploy; the old code stops working at once, personal links are unaffected. |
| `READ_CAP_PER_DAY` | Model reads per invited person per UTC day. Default 40; 0 = off; the owner is exempt. |
| `READER`, `READER_MODEL`, `READER_THINKING` | `stub` = offline mode (recorded reader answers and one recorded game; refuses to start with `GCP_PROJECT`); model id (default `gemini-3.6-flash`); thinking level (`minimal`; 3.7/3.8 Flash need `low`). |
| `WEB_DIR`, `PORT` | Set by the Dockerfile / Cloud Run. |

`INVITE_CODE` is currently a plain environment variable on the service, not a Secret Manager secret.

## One-time GCP setup
1. APIs: Firestore (Native), Cloud Storage, Cloud Run, Artifact Registry, Vertex AI.
2. Firestore TTL policy on collection group `sheets`, field `expiresAt` (active). `get` also ignores expired docs; TTL deletion can lag. Collections: `sheets` (a runner's delete sets `deletedAt` and leaves the document and photo until `expiresAt`; a sheet on a venue also carries `posted` or `draft` until published; `expiresAt` is fixed when the sheet is made or its game changes, not on every edit), `users`, `venues` (venue sheets expire 7 days after the game, other sheets after 30; passes are signed with a key derived from `INVITE_CODE`, so changing the owner code signs every viewer out, and no new env var or index is needed).
3. Private bucket `block-pool-checker-photos`: uniform access, public access prevention enforced, two lifecycle rules: delete once the object's custom time has passed, and delete after 60 days. The API stamps each photo's custom time with its sheet's removal date (and moves it if that date changes), so a photo goes the day its sheet does; the 60-day rule is the backstop. Deleting a sheet by hand deletes its photo at once; Firestore TTL alone does not. Set the rules with `gcloud storage buckets update gs://block-pool-checker-photos --project block-pool-checker --lifecycle-file=lifecycle.json`, where the file holds `{"rule":[{"action":{"type":"Delete"},"condition":{"daysSinceCustomTime":0}},{"action":{"type":"Delete"},"condition":{"age":60}}]}`. Photos are read and written only by the API; there are no signed URLs and no bucket CORS.
4. Service account `bpc-api`: Firestore user, Storage object admin on the bucket, Vertex AI user.
5. Budget alert: $10 a month. Cloud Run `--max-instances 3`.
