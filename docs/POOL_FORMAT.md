# Pool formats and conventions

- 10x10 named squares; top team's digits map columns 1–10; left team's digits map rows 1–10.
- Four payout periods: Q1, Half, Q3, Final. Each period may have independent top and left digit permutations; some pools use one shared pair.
- Period scores are cumulative. E.g. Eagles 10–Commanders 27 on Nov 1 2026: Q1 10–3; Half 10–13; Q3 10–16; Final 10–27.
- Score ending is `score % 10`. Winning physical col = index of top ending + 1; winning physical row = index of left ending + 1.
- Team names visible on the paper are strongly recommended; if missing, user must identify both teams and orientation. Historic names count (Redskins, Washington Football Team, Commanders).
- Photograph coordinates: four corners of actual 10x10 square grid in original photo pixels, order TL, TR, BR, BL. Do NOT include numeric/header bands.
- Owners keyed by `row,col` strings, 1-based. Names may be unreadable: leave them blank or "?" (unconfirmed) rather than guessing. The app reads names from the photo, shows them as unconfirmed until a person confirms or retypes them, and a name can match several squares ("Ben + Emil").
- For current scores, report 'currently winning' as provisional. Lock/confirm actual period winners only after official period completion.
