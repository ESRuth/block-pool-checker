# CLAUDE.md

Guidance for Claude Code in this repo. Read `docs/PLAN.md` first: its "Origin and goal" section defines the product (photo of the pool sheet in, same photo out with winning squares marked). It also holds milestones and open questions. Update it as work lands.

## What this is
Block Pool Checker: an installable, mobile-first PWA for checking football squares pools on a phone during games. It grew out of a Custom GPT prototype (spec preserved in `docs/legacy/`, board rules in `docs/POOL_FORMAT.md`); it is an app now, not a GPT/plugin/skill.

## Hard constraints (from the owner)
- **Fully independent of Beventra** (`~/src/beventra`, a different product). Own repo, GCP project, Firestore, storage. No imports, shared packages or shared data stores. Reading Beventra for patterns is fine; copying its stack by default is not. Same GCP billing account is OK.
- GCP is the host. Firestore is approved (server-side `@google-cloud/firestore` only, behind a repository interface). Do NOT mandate Firebase SDK/Auth/Hosting.
- No AI-tool integrations (GPT/MCP/skills) are planned. Any vision model only PROPOSES teams, digits, corners and names from a photo; a human confirms (digits by the 0-9 check and the marked photo, names by tapping "?" or retyping). Which model is open (see PLAN P2).
- **Never present cached scores as live.** Every score carries source, status and `fetchedAt`; the UI shows freshness and offline state.
- Digits must be a 0-9 permutation or it's a hard stop (never guess). "Currently winning" is provisional until a period is official. Names the user hasn't confirmed stay "Unverified".
- Pool photos show handwritten names: keep storage private (photos are served only through the API, never by public or signed URL), don't log or publish them. The bucket lifecycle rule is the backstop for the 30-day deletion.

## Commands
Node >= 24, pnpm 11.
```bash
pnpm install
pnpm test          # unit tests, all packages (vitest)
pnpm typecheck
pnpm lint          # ESLint (TypeScript + React hooks rules)
pnpm format        # Prettier, writes; `pnpm format:check` only checks
pnpm e2e           # Playwright in a phone-sized browser against the built app + stub reader (offline, free)
```
First time on a machine: `pnpm --filter @bpc/e2e install-browser` (downloads Chromium for the e2e tests). `pnpm-workspace.yaml` has `allowBuilds: esbuild: true`; without it pnpm 11 install fails on the esbuild build-script approval.

## Layout
- `packages/engine`: Zod schemas + pure scoring/payout logic. Source of truth; API and web import it. Golden fixture: `packages/engine/fixtures/eagles_commanders_2026.json` (four known winners).
- `packages/scores`: `ScoreProvider`/`GameDirectory` interfaces, ESPN NFL adapter, manual provider. Tests use recorded fixtures in `test/fixtures/` (no network).
- `packages/vision`: pure-TS image helpers + `snapGrid` (snap rough grid corners onto printed lines). Tests decode `samples/*.jpg` with jpeg-js.
- `e2e/`: Playwright tests of the real flows (new sheet, view/edit links, My Sheets, grid touch drag and repair, invited person). They start the built app with `READER=stub`, so they need no network and cost nothing.
- `docs/READER_RESULTS.md`: the reader experiments (model, thinking level and layout comparisons) behind the choice of Gemini Flash. The Python scripts were removed; they are in git history.
- `services/api`: Hono API (saved sheets and their photos, personal keys and `/admin`, photo and name reading, scores, games). Runs in memory without `GCP_PROJECT`; Dockerfile at repo root; deploy steps, env vars and GCP setup in `docs/DEPLOY.md`. Live on Cloud Run; always `--project block-pool-checker`.
- `apps/web`: Vite + React + vite-plugin-pwa viewer. Dev on :5173 (proxies `/api` to :8080);
- `samples/`: four sample photos (names are made up, grid lines redrawn at known corners in `packages/vision/test/fixtures/parity.json`). Never commit a real pool photo: it shows people's handwriting and phone numbers.

## Conventions
- Each tsconfig lists its `types` explicitly (TypeScript 7 no longer includes every `@types/*` package on its own). `@types/node` stays on the major that matches the runtime (24); Dependabot ignores major versions, so those upgrades are done by hand and tested first.
- Types crossing a boundary are Zod schemas with `z.infer` types, in the engine package.
- Scores are cumulative; ending = `score % 10`; top team = columns, left team = rows; rows/cols are 1-based; owners keyed `"row,col"`.
- CI (`.github/workflows/ci.yml`) runs a dependency audit (fails on high or critical), lint, format check, typecheck, unit and e2e tests on every push to `main` and on PRs; its actions are pinned to commit SHAs and Dependabot (`.github/dependabot.yml`) proposes weekly updates. The repo is public: `main` blocks force-pushes and deletion (a ruleset), and nothing real (photos, names, phone numbers, keys) may be committed. Work on `main` is still fine (private, solo repo); open a PR when you want CI before merging.
- Commit messages end with the Co-Authored-By line from the session's attribution reminder.
- Web code layout: `src/App.tsx` picks the page, `src/pages/` one file per screen (`pages/sheet/` is the sheet page with its tabs and sections), `src/components/` pieces shared by more than one page, `src/hooks/` stateful logic (`useSheetDoc` loads and autosaves, `useNameReading`, `useGridHistory`, `useSquares`, `useScore`), `src/lib/` pure logic and API clients (unit tested). Keep logic in `lib/`/hooks so screens stay thin.
- API layout: `src/app.ts` wires `src/routes/{admin,sheets,games,reading}.ts`; who-is-asking and the daily read cap are in `src/access.ts`; storage sits behind the repository interfaces in `sheets.ts` and `users.ts` (memory and Firestore versions).
- Dev machine is `min-e-server` (SSH box where Claude runs); the user's browser is on their local PC, so dev servers need port forwarding.
