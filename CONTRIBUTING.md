# Contributing

Thanks for looking. This is a small solo project, so please open an issue before a large change.

## Set up
Node 24 and pnpm 11 (see `.nvmrc`).

```bash
pnpm install
pnpm --filter @bpc/e2e install-browser   # once: Chromium for the end-to-end tests
pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm e2e
```

Everything runs offline. For a free local app, run the API with `READER=stub` (recorded reader answers and demo games in every state; no model or network calls) and the web app with `pnpm --filter @bpc/web dev`. See `README.md` and `docs/DEPLOY.md`.

## Ground rules
- **Never commit a real pool photo, name or phone number.** Photos show people's handwriting. Sample data must be made up (`samples/` ignores new files by default; add with `git add -f` only for made-up ones).
- Keep the safety rules in `CLAUDE.md`: digits must be a 0-9 permutation or it is a hard stop; names stay unverified until a person confirms them; a cached score is never shown as live; colour is never the only cue.
- Types that cross a boundary are Zod schemas in `packages/engine`. Keep logic in `lib/` and hooks so screens stay thin.
- Add or update tests with your change, and update the docs if behaviour or setup changes.
- Security problems: see `SECURITY.md`, not a public issue.

CI runs the audit, lint, format check, typecheck, unit and end-to-end tests on every pull request.
