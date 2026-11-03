# GPT Builder acceptance checklist (must be run manually in the actual Custom GPT)

1. Upload `tests/photos/eagles_commanders.jpg`; GPT detects Eagles TOP and Commanders LEFT and four digit sets. It suggests latest matching game, lets user select Nov 1 2026, verifies scores, and returns Q1 Ted Q (row 8 col 6), Half BAKER (row 7 col 6), Q3 P.P. (row 5 col 8), Final Reed (row 3 col 9).
2. Verify annotated ORIGINAL photograph is readable; 4 frames match physical cells, interiors are not filled; inspect actual generated JPEG and open its download link.
3. Request 'My Possible Wins for Dan McCoy' and verify row 9 col 7, Q1 6–0, Half 5–4, Q3 4–5, Final 2–5. If image owner name is unclear, GPT asks before confirming.
4. Upload `tests/photos/eagles_chargers.jpg` (no visible team names). GPT asks for both team names AND orientation, rather than silently assuming. Verify four independent mappings, Dec 8 2025 score selection, OT final rule.
5. Upload `tests/photos/patriots_rams.jpg`; GPT detects a SHARED digit set, not four mappings; verify final Patriots 13–Rams 3. (Review owner labels visually before treating as verified.)
6. Request a game from ten years ago. GPT provides selectable historical games instead of assuming most recent; verifies score before computing.
7. Ask 'refresh' for an in-progress game. GPT looks up a current source, identifies provisional current winner and completed payout winners, reports source and timestamp/uncertainty. It must not claim background refresh.
8. Configure $10/square, 100 sold, four 25% payouts. Expect $1000 pot and $250 each; test fixed-dollar payouts and unsold squares.
9. Save pool: get portable ZIP with original image and JSON; reopen in a fresh chat and verify digit mappings without re-OCR. Do not claim cloud storage.
10. Invalid permutation (duplicate/missing digit) must trigger a clarification, not a winner. Ambiguous handwritten name must remain unverified.
11. Verify image attachments really open in GPT Builder; if not, regenerate and supply text fallback. Do not claim QA passed without inspection.

Passing Python unit tests is necessary but NOT sufficient: OCR and image alignment need manual visual acceptance.
