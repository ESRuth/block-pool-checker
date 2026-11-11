# How it works

What the app does, the rules it keeps and why. Words are defined in [GLOSSARY.md](GLOSSARY.md); using the app is in [GUIDE.md](GUIDE.md).

## The idea
Give the app a photo of a pool's paper sheet and see that photo with the winning blocks boxed. The marked photo is what makes the result trustworthy: people read the names off their own sheet, so one glance shows the read was right. People who only watch need no account; the person running a pool needs only a phone.

Not in scope: payouts and paid/unpaid tracking, a GPT/MCP front end, viewer accounts, a CAPTCHA, recurring schedules and member lists, leagues other than the NFL.

## Pool rules
- 10x10 blocks. The top team's digits give the columns, the left team's digits give the rows (1-based; owners keyed `"row,col"`).
- Four periods: end of Q1, halftime, end of Q3, final. Each can have its own digit rows, or one shared pair.
- Scores are cumulative; an ending is `score % 10`. A game that ends 10-27 has Q1 10-3, half 10-13, Q3 10-16, final 10-27. The final includes overtime unless the sheet's `finalIncludesOvertime` is off.
- Each digit row must be a 0-9 permutation or the app stops; it never guesses.
- A period still being played is "winning now" (provisional). A winner is official only when the period is.
- Team names written on the sheet are strongly preferred; without them the app asks for both teams and which is across the top. An earlier name of a team counts ("PHILA EAGLES", "NFC - BUCS").
- Grid corners are the four corners of the 10x10 blocks, in photo pixels, order TL, TR, BR, BL. They exclude the digit bands.
- A name may be unreadable: it stays blank or "?" (unconfirmed), never guessed. One name can match several blocks ("Pat + Sam").

## Access
No sign-up. The owner holds the owner code (`INVITE_CODE`, 20+ random characters, 128+ bits) and in the People tab makes a personal link per person (`/join#c=<key>`). Opening the link keeps the key, signs the phone in and goes straight to its home page (replacing the address, so the key is not left in the history). The key is kept on the phone (`bpc.key`) and baked into the manifest `start_url`, so a home-screen icon opens signed in (iPhone home-screen apps do not share browser storage). Keys are stored hashed in Firestore `users`, can be revoked, and their use is counted. A daily cap (`READ_CAP_PER_DAY`, default 40 model reads per UTC day, owner exempt) answers 429.

| Who | Gets in with | Can |
|---|---|---|
| Owner | Owner code | Everything, on every venue and sheet; bypasses PINs |
| Runner (main or backup) | Personal key | Run their venues' sheets: post, add photos, publish, rename, delete, restore, change PINs |
| Maker | Personal key | Edit the sheets they made (a runner, so the same sheets any runner of the venue can edit) |
| Viewer | Venue QR + PIN (or a sheet's own PIN) | Watch: names and winners; the photo only if a runner allows it; never marked blocks |

Personal keys live in the URL fragment of the personal link, so they never reach the server; only their hashes are stored. Every sheet is on a venue, so every sheet is behind a PIN. A group that is not a venue (an office pool, a private pool) gets a venue from the owner: a name, a PIN and a runner list.

## Navigation
The app is a single page: links to its own addresses swap the screen in place (`lib/router.ts`: the browser's history, one click handler for same-origin links, back and forward). A provider (`lib/auth.tsx`) holds who is signed in (checking, signed in, signed out, or offline) and is the only thing that asks the server `/api/me`; the key is the only thing kept in the browser. A bar at the top of every page (`components/AppBar.tsx`) shows where you are and who you are:
- **Owner:** Venues (home), Sheets (everyone's, deleted ones marked) and People (personal links), and a menu under their name (Help, Privacy, Use a different code, Sign out).
- **Runner:** no tabs. Home lists the venues they run, or goes straight into the only one.
- **Viewer** (venue PIN only): the app's name, Help and Privacy.
An unreachable server never looks like being signed out. A code is checked before it replaces the saved key.

## Sheets
- **Making one.** A runner (or the owner) opens a venue's page and either posts a sheet (see Venues) or taps "Add a sheet from a photo" (`/new?venue=<code>`): take or choose a photo (the browser shrinks it and strips metadata), read it, then answer only what is still needed: teams, digit rows that fail the check, the game, the grid. The sheet is made as a draft at `/s/<id>`. `/new` without a venue or a posted sheet explains where to start.
- **Saving.** `POST /api/sheets` (`{venueId, doc}`, a runner of that venue or the owner) stores the document (teams, digits, corners, game, names, `mine`) in Firestore and the photo privately in Cloud Storage, served only through `GET /api/sheets/:id/photo`. Edits autosave. Reopening makes no model calls. The browser keeps only the last score (offline fallback) and the access key.
- **The sheet page.** A scoreboard, the winners (one row per period), the photo with winners boxed, and tabs: Blocks, Names, Edit and Settings (editors), Help. Settings holds the sheet's name, publish or hide, its own PIN, and whether viewers see the photo.
- **Finding blocks.** Every typed word must start a word in the name; no fuzzy matching, near misses show as "Maybe also". Tapping blocks marks them as mine (private to editors); winners that are yours say "★ yours".
- **If there's a score next.** During a live game: who leads each period now and who would lead after each kind of scoring play. When ESPN's live `situation` names the team with the ball, its scores are listed first; this only orders the list.
- **Result view.** Winning blocks get a box with the period number (1, 2, 3, F) in a corner badge, so colour is never the only cue. Colours: orange `#d55e00`, blue `#0072b2`, teal `#00785a`, deep purple `#5b1a8c`. The report is page content, not an exported image.
- **Scores.** From ESPN (unofficial; expect drift), cached about 20 s on the server. Every score carries its source, status and `fetchedAt`; a cached score is never shown as live.

## Reading
- **Photo.** One call reads teams, digit rows and grid corners; it never asks for names or phone numbers. Gemini 3.6 Flash on Vertex AI, minimal thinking, using the service account. `POST /api/read` takes a raw image (up to 8 MB), stores nothing and logs nothing.
- **Names.** One call (`POST /api/read-names`) reads all 100 names from the straightened grid. They are saved unconfirmed ("?") until a person taps "Looks right" or retypes them, and are not re-read unless asked.
- **Grid placement.** The model's corners are a first guess. `snapGrid` (`packages/vision`, pure TypeScript) snaps them onto the printed lines; it fixes sideways or size errors up to about 0.4 block, not per-corner errors, and a wrong snap cannot be told from its score. So the marked photo and drag-to-adjust are the real safety net. A dragged corner is clamped to the photo; Undo keeps 20 moves; a corner more than 6% outside the photo raises a "Fix the grid" banner. A grid cut off by the photo is flagged and a winner in the cut-off part is listed, not marked.
- **Games.** Suggestions are team-based: head-to-head first, newest first; otherwise recent games plus text search.
- Measured accuracy and the reasons for these choices: [READER_RESULTS.md](READER_RESULTS.md). `READER=stub` serves recorded answers and demo games, so local testing is free.

## Venues
A venue (lodge, bar or club) runs pools every week, sometimes two for one game. A link that is the only secret leaks when a QR code is photographed, so a PIN guards the venue.

- **Record.** `venues` collection: name, code (the QR, 128 bits), PIN hash (scrypt) and version, runner ids. The owner makes venues in the Venues tab; runners and the owner manage them at `/v/<code>`, which also draws the printable QR in the browser.
- **Sheet fields.** `venueId`, `title` (editable; `game.label` is the provider's and untouched), `showPhoto`, its own PIN fields, and the stage (`posted`, `draft`, `deletedAt`). The effective PIN is the sheet's own, else the venue's.
- **Entry.** `POST /api/venues/:id/enter` or `/api/sheets/:id/enter`. A right PIN sets a signed pass: HttpOnly, SameSite=Strict, path `/api`, 90 days, bound to the PIN version, signed with a key derived from `INVITE_CODE`. After 5 wrong tries in a row the PIN locks for 1, 2, 4 … 60 minutes; the runner sees the count.
- **What viewers get.** Before the PIN: the venue name only. After it: names and winners, no `mine`, no photo unless `showPhoto`. Editors and the owner are never asked for a PIN. Anyone can send a photo to a runner, so there is no public upload.
- **Posted first, photo later.** This mirrors the paper. **Post a new sheet** picks a game (not yet started, soonest first, up to 60 days ahead via `GET /api/games/upcoming`; a team search finds its whole schedule), the team across the top, and an optional tag such as "$10". It creates a sheet with a placeholder grid and no photo. Viewers see **Open for blocks**: game, date, tag, no id and no way in. When the digits are drawn the runner adds the photo; the game and teams are already known, and storing the photo moves the sheet to draft.
- **Hardening.** Every response sends `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, a `Permissions-Policy` that turns off camera, microphone, location and payment, and a Content-Security-Policy that allows only this address (no framing, no other sites; inline styles only). Wrong-PIN attempts on one PIN are handled one at a time, so a burst of simultaneous guesses cannot dodge the lockout.
- **Known limits.** A PIN spreads to anyone who knows it, like the paper sheet on the wall. A stranger can briefly lock a PIN by guessing. The view id is in the URL path, so it is in server logs. Changing the owner code signs everyone out.

## Stages and retention
Stages (posted, draft, published, deleted, gone) are defined in [GLOSSARY.md](GLOSSARY.md#places-and-stages).
- "Hide it again" returns a published sheet to draft; a posted sheet cannot be published until its photo is in. A sheet record with no venue (from before every sheet was on one) is opened only by its maker and the owner, and is removed on its normal date.
- Pre-game, live and final come from the score feed and are not stored, because a stored status could be stale. Lists show "Open for blocks", "Draft" and "Deleted" as words, never colour alone.
- A final sheet stays editable until it is removed.
- **Removal date.** 7 days after kickoff, or after the day the sheet was made if later. Editing never moves it; changing the game recomputes it. Firestore TTL on `sheets.expiresAt` removes it and reads ignore expired documents; each photo is stamped with its sheet's removal date and the bucket deletes it then; the bucket's 60-day rule is the backstop.
- **Soft delete.** A delete hides the sheet from every list and link, but it and its photo are kept until the removal date. The owner, the maker, the venue's runners still see it, dimmed and marked "Deleted" with the day it goes, and can restore it. Everyone else gets "not found". Only the owner can erase early.

## Stack and cost
TypeScript, pnpm workspaces, Vitest. Layout is in the [README](../README.md). Firestore only through the server-side `@google-cloud/firestore`, behind repository interfaces; photos in a private bucket read and written only by the API (no signed URLs); no Firebase SDK, Auth or Hosting. The service worker caches the app shell only; every `/api/*` call goes to the network.

Model calls cost money. Guards: revocable counted personal keys, the owner code, the daily read cap, image size limits, Cloud Run `--max-instances 3`, and a $10 monthly budget alert (which does not stop spending).
