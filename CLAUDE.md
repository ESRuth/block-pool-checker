# CLAUDE.md

Guidance for Claude Code in this repo. Read `docs/HOW_IT_WORKS.md` first: it defines the product (photo of the pool sheet in, same photo out with winning blocks marked). What is not yet verified, and the open questions, are in `docs/DEVELOPING.md` (Project status). Keep both describing the app as it is now.

Use the words in `docs/GLOSSARY.md` (pool, sheet, block, venue, runner, owner, posted, draft, published, pass …) in the app, docs and code comments; if you meet a different word for one of those things, fix it or flag it.

## What this is
Block Pool Checker: an installable, mobile-first PWA for checking football block pools on a phone during games. Pool rules are in `docs/HOW_IT_WORKS.md`.

## Hard constraints (from the owner)
- GCP is the host. Firestore is approved (server-side `@google-cloud/firestore` only, behind a repository interface). Do NOT mandate Firebase SDK/Auth/Hosting.
- No AI-tool integrations (GPT/MCP/skills) are planned. Any vision model only PROPOSES teams, digits, corners and names from a photo; a human confirms (digits by the 0-9 check and the marked photo, names by tapping "?" or retyping). 
- **Never present cached scores as live.** Every score carries source, status and `fetchedAt`; the UI shows freshness and offline state.
- The owner code (`INVITE_CODE`) must be 20+ random characters with `GCP_PROJECT` set (checked at startup). It has no attempt limit; length is the protection.
- Venues (`/v/<code>`) are protected by a PIN, enforced on the server (a signed pass cookie; wrong tries lock the PIN for longer each time). A sheet joins a venue as a draft, visible only to the people who could edit it until a runner publishes it. A sheet in a venue or with its own PIN is never served without a pass, and viewers get no photo unless a runner allows it. The owner can do everything a runner can. A delete is a soft delete: hidden from viewers and links, but still listed (marked) for the owner, the maker and venue runners, who can restore it until the normal expiry; only the owner erases early. No viewer accounts, no CAPTCHA (see `docs/HOW_IT_WORKS.md`).
- Digits must be a 0-9 permutation or it's a hard stop (never guess). "Currently winning" is provisional until a period is official. Names the user hasn't confirmed stay "Unverified".
- Pool photos show handwritten names: keep storage private (photos are served only through the API, never by public or signed URL), don't log or publish them. The bucket's 60-day lifecycle rule is the backstop for the 30-day deletion.

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
- `packages/engine`: Zod schemas + pure scoring and geometry logic. Source of truth; API and web import it. Golden fixture: `packages/engine/fixtures/eagles_commanders_2026.json` (four known winners).
- `packages/scores`: `ScoreProvider`/`GameDirectory` interfaces, ESPN NFL adapter, manual provider. Tests use recorded fixtures in `test/fixtures/` (no network).
- `packages/vision`: pure-TS image helpers + `snapGrid` (snap rough grid corners onto printed lines). Tests decode `samples/*.jpg` with jpeg-js.
- `e2e/`: Playwright tests of the real flows (new sheet, view/edit links, My Sheets, grid touch drag and repair, invited person, venue QR with PIN, deleting and restoring a sheet). They start the built app with `READER=stub`, so they need no network and cost nothing.
- `docs/GUIDE.md` and the app's `/help` page are one text, `apps/web/src/lib/guide.ts`: edit it there, then `UPDATE_GUIDE=1 pnpm --filter @bpc/web test` rewrites the markdown (the test fails when they differ). Change it whenever a screen or flow it describes changes. The privacy policy works the same way (`lib/privacy.ts`, `docs/PRIVACY.md`, `/privacy`): update it, and its date, whenever what the app stores, sends, shares or deletes changes.
- `docs/READER_RESULTS.md`: the measured reader results (model, thinking level and layout comparisons) behind the choice of Gemini Flash.
- `services/api`: Hono API (saved sheets and their photos, personal keys and `/owner`, photo and name reading, scores, games). Runs in memory without `GCP_PROJECT`; Dockerfile at repo root; deploy steps, env vars and GCP setup in `docs/DEPLOY.md`. Live on Cloud Run; always `--project block-pool-checker`.
- `apps/web`: Vite + React + vite-plugin-pwa viewer. Dev on :5173 (proxies `/api` to :8080);
- `docs/screenshots/`: the two README images, made from the offline demo (`READER=stub`) with a sample sheet. Keep them WebP, 720 px wide, quality 85 (about 75 KB each); a full-size PNG is about 1 MB. Redo them when the screens change noticeably.
- `samples/`: four sample photos (names are made up, grid lines redrawn at known corners in `packages/vision/test/fixtures/parity.json`). Never commit a real pool photo: it shows people's handwriting and phone numbers.

## Conventions
- Each tsconfig lists its `types` explicitly (TypeScript 7 includes only the `@types/*` packages a tsconfig names). `@types/node` stays on the major that matches the runtime (24); Dependabot ignores major versions, so those upgrades are done by hand and tested first.
- Types crossing a boundary are Zod schemas with `z.infer` types, in the engine package.
- Scores are cumulative; ending = `score % 10`; top team = columns, left team = rows; rows/cols are 1-based; owners keyed `"row,col"`.
- CI (`.github/workflows/ci.yml`) runs a dependency audit (fails on high or critical), lint, format check, typecheck, unit and e2e tests on every push to `main` and on PRs; its actions are pinned to commit SHAs and Dependabot (`.github/dependabot.yml`) proposes weekly updates. The repo is public: `main` blocks force-pushes and deletion (a ruleset), and nothing real (photos, names, phone numbers, keys) may be committed. Work on `main` is still fine (private, solo repo); open a PR when you want CI before merging.
- Commit messages end with the Co-Authored-By line from the session's attribution reminder.
- Web code layout: `src/App.tsx` picks the page, `src/pages/` one file per screen (`pages/sheet/` is the sheet page with its tabs and sections), `src/components/` pieces shared by more than one page, `src/hooks/` stateful logic (`useSheetDoc` loads and autosaves, `useNameReading`, `useGridHistory`, `useBlocks`, `useScore`), `src/lib/` pure logic and API clients (unit tested). Keep logic in `lib/`/hooks so screens stay thin.
- API layout: `src/app.ts` wires `src/routes/{owner,sheets,venues,games,reading}.ts`; who-is-asking and the daily read cap are in `src/access.ts`; PINs, passes and the lockout are in `src/pins.ts`; storage sits behind the repository interfaces in `sheets.ts`, `users.ts` and `venues.ts` (memory and Firestore versions).
- Dev machine is `min-e-server` (SSH box where Claude runs); the user's browser is on their local PC, so dev servers need port forwarding.
