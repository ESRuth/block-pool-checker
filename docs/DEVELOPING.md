# Developing

Setting up, running and deploying Block Pool Checker. What the app does is in [HOW_IT_WORKS.md](HOW_IT_WORKS.md); the words used are in [GLOSSARY.md](GLOSSARY.md); production setup is in [DEPLOY.md](DEPLOY.md).

## What you need
| To | You need |
|---|---|
| Run it locally, offline, free | Node 24, pnpm 11. No account, no keys: run the API with `READER=stub`. |
| Read photos with a model | A Google Cloud project with the Vertex AI API on. The reader is Gemini 3.6 Flash on the global Vertex endpoint, called with the service account's identity (no API key). Change it with `READER_MODEL` / `READER_THINKING`. A sheet costs about half a cent to read; `READ_CAP_PER_DAY` limits each invited person. |
| Save sheets | Firestore (Native mode) for sheets, venues and people, and a private Cloud Storage bucket for photos. Locally the API keeps both in memory. |
| Host it | Cloud Run, one container (API plus the built web app). Steps and every env var: [DEPLOY.md](DEPLOY.md). |
| Live scores | Nothing to sign up for: the ESPN scoreboard is used without a key. It is unofficial and may change; the app then shows the last stored score marked "not live". |

## Develop
```bash
pnpm install
pnpm test        # unit tests, all packages
pnpm typecheck
pnpm lint        # ESLint; `pnpm format` runs Prettier
pnpm e2e         # Playwright against the built app with the stub reader (first: pnpm --filter @bpc/e2e install-browser)
pnpm --filter @bpc/api dev     # API on :8080, in memory (no GCP_PROJECT)
pnpm --filter @bpc/web dev     # web on :5173, proxies /api to :8080
```
For free UI testing run the API with `READER=stub`: recorded reader answers and demo games between the sample sheet's teams (the recorded final, plus live in the 3rd quarter, halftime, not started, and a final in overtime). Every sheet is made on a venue, so first make one at `/owner` (any code works while `INVITE_CODE` is unset), then open it and choose "Add a sheet from a photo". Pick a demo game under "Which game?" on the new sheet, or on an existing one under Details > Change the game. No model or network calls, no cost. Without `INVITE_CODE` the local API is open and every caller is the owner; set `INVITE_CODE=anything` to test access control.

## Layout
- `packages/engine`: Zod schemas and pure logic: winning blocks, per-period results, grid geometry, the saved-sheet document. Single source of truth for web and API.
- `packages/scores`: `ScoreProvider` / `GameDirectory`, the ESPN NFL adapter, a manual provider.
- `packages/vision`: pure-TS image helpers and `snapGrid`, which snaps rough grid corners onto the printed lines.
- `services/api`: Hono API on Cloud Run: sheets, venues, PINs, personal keys, reading, scores, games. Serves the built web app.
- `apps/web`: Vite + React 19 PWA. `src/pages/` one file per screen, `src/components/` shared pieces, `src/hooks/` stateful logic, `src/lib/` pure logic and API clients.
- `samples/`: four sample photos for the tests. The names are made up and the grid lines are drawn at known corners, so they hold no real data. They are regression fixtures, not accuracy benchmarks. New photos here are git-ignored.
- `e2e/`: Playwright tests of the real flows, offline against the stub reader.
- `docs/`: the documentation (see the README for the list).
