> **Record of the reader experiments (Nov 2026).** The Python scripts, ground-truth files and generated images these results came from were removed from the repo after the decisions were made. They are recoverable from git history: `git show 3581f00~0:spikes/reader/<file>` (for example `names_eval.py`, `audit.py`, `truth/`). Paths below that start with `spikes/` refer to those removed files.

# Reader spike results (2026-11-02)

Question: can a vision model read teams, digit rows and grid corners from a photo of a pool sheet?
Setup: 4 real photos (the `samples/` photos were later replaced with made-up names; the real ones are only in private git history) x 4 models x 2 runs (32 calls), same prompt (`run.py`), scored against `truth/*.json`
(digit truth: engine fixture for eagles_commanders; the other three read by Claude and confirmed by the owner).
Claude via the direct Anthropic API; Gemini via Vertex AI (global endpoint) in project `block-pool-checker`.
Names and phone numbers are never requested. Overlays are in `out/` (gitignored: they show names and phone numbers).

## Results
| Model | Digits correct | Teams | Median time | Tokens in/out | Cost/photo |
|---|---|---|---|---|---|
| Claude Sonnet 5.5 | 520/520 | all correct (null when not visible) | 9s | ~4.9k / ~1.1k | ~$0.02 (at $2/$10 per MTok) |
| Claude Haiku 5.5 | 520/520 | missed "CHIEFS" (2/2 runs on eagles_chiefs) | 7s | ~4.9k / ~1.5k | not priced |
| Gemini 3.6 Flash | 520/520 | all correct | 12s | ~1.7k / ~2-3k (incl. thinking) | not priced yet |
| Gemini 3.1 Pro Preview | 520/520 | all correct | 7s (max 79s) | ~1.7k / 0.4-4.5k | not priced yet |

- **Digits are solved on these photos**: 100% for every model, shared vs per-period detected correctly, every row a valid 0-9 permutation.
- **Teams**: models correctly returned null when no team name is visible (Chargers photo; left team on Chiefs). Haiku is the only one that missed a visible name.
- **Corners are the weak point.** Judged by eye on overlays (only eagles_commanders has an approximate numeric truth):
  - Commanders vs fixture corners (fraction of image width): Sonnet 0.5%, Gemini Flash 1.0%, Gemini Pro 4.2%, Haiku 12%.
  - Chiefs: Claude (Sonnet and Haiku) included the digit-label bands in the grid, shifting every cell. Gemini Flash fit the squares.
  - Chargers: Gemini Flash fit well; Sonnet narrowed toward the right and drifted.
  - Patriots (tilted, right edge cropped): all approximately right; the 10th column is partly outside the photo.
  - Even the best fits drift by up to about a cell at the edges (paper curl, hand-ruled lines). A marker could land one cell off.

## Takeaways
1. Use the model for teams + digits (+ a first guess at corners); do not trust its corners alone.
2. Refine corners afterwards: snap to detected grid lines (image processing) and/or let the user drag a corner. The marked photo makes errors easy to see.
3. Running two models and requiring identical digits gives cheap redundancy for the "never guess" rule.
4. Sample size is small: 4 photos from one pool organizer. Blurry, dark or differently laid out sheets are untested.

## Corner refinement spike (no AI): `refine.py`
Method: warp the area around the model's rough corners, extract long dark strokes, fit 11 evenly spaced lines per axis, map back.
Run: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python refine.py` (needs `out/results.json` from `run.py`).

- **Good starts get better.** Flash corners moved only 0.06-0.5 of a cell, and by eye the lines then sit on the printed grid
  on Chargers and on the visible part of the tilted Patriots photo (where the unrefined grid had drifted).
- **Bad starts are not rescued.** Sonnet's Chiefs run 0 included the digit-label bands; refinement kept the wrong block
  (the label bands share the grid's line spacing, so line evidence alone cannot tell where the squares begin).
- **The "do different starts converge?" metric was not informative** on good starts (already within ~0.3 cell) and was misleading on Chiefs.
- **Disagreement between models is a usable confidence signal.** Unrefined Sonnet vs Flash corner distance: Commanders 0.13 cell,
  Patriots 0.32, Chargers 0.34, Chiefs 1.46 (the bad one). A threshold around 0.6 cell separates them on this tiny sample.
  Sonnet was also unstable across runs on Chiefs (1.02 vs 0.18 cells moved), which Flash was not.
- **Cropped grids**: on the Patriots photo the 10th column is outside the photo, so a winner there can't be marked. The app must say so.
- Residual error with hand-ruled sheets is probably ~0.1-0.2 cell. Not measured against hand-labeled truth (none exists).

Plan: Flash corners -> snap to lines -> show; if Sonnet's corners disagree by more than ~0.6 cell (or the user sees the grid is off), show drag-to-adjust first.

## Follow-up: TypeScript port (`packages/vision`) and its limits
The port matches this Python spike to within 0.03 square. Testing it against deliberately displaced guesses found that the fit
(translation + spacing per axis) fixes sideways/size errors up to ~0.4 square in 11 of 12 cases, can lock onto a wrong alignment
in the 12th with an unchanged evidence score, and does not fix per-corner errors. Search reach was reduced from ~0.8 to 0.45 square
after a wider search snapped a whole square off. The statement above that "good starts get better" holds for small errors only.

## Held-out run (2026-11-02): 7 unseen photos, Flash x2 + Sonnet x1
Photos: owner-supplied, sanitized first (`prepare.py`: upright, max 2048px, all metadata incl. GPS stripped; copies in `out/heldout/`, gitignored).
Split recorded in `truth/sets.json`; games in `truth/games.json` (capture time + ESPN schedule); readings in `truth/heldout_agreed.json`.

- **All 3 readers returned identical digits on all 7 photos; every row a valid 0-9 permutation** (21 calls, 0 failures, ~54k tokens in / 41k out in total).
- **Independent confirmation:** the Super Bowl LIII photo (a second copy of `patriots_rams.jpg`'s picture, rotated) reproduces the owner-confirmed digits exactly;
  the two Oct 22 2023 photos came out identical (same sheet, two shots).
- **Effectively 5 new distinct sheets** (SB LV, MIA@PHI, GB@PHI wild card, SB LIX, LV@PHI); the 2019 photo duplicates a dev photo.
- **Teams:** visible on only some sheets ("PATRIOTS/RAMS", "NFC-BUCS/AFC-CHIEFS", "PHILA EAGLES"); three sheets have no team names, so the app must ask or suggest games.
  Capture time identified the game for every photo, but that was only used to label these test photos; it is not a product feature (real photos are taken near game day and show the team names).
- **Not human-confirmed:** agreement between readers is strong evidence, not truth. Flash and Sonnet could share a systematic misread; a person glancing at the rows would settle it.
- **Corners (eyeballed):** good fit on SB LIX; the right edge of the 2019/Patriots photo is cropped as before. Flash still reports `grid_complete: true` on that cropped photo.

## Name reading: how to call the model (2026-11-03)
Scored on 3 owner-verified sheets (300 squares), exact match ignoring case/punctuation; run-to-run noise is about ±3 points. `names_eval.py`.

| Setup | calls/sheet | exact | tokens/sheet |
|---|---|---|---|
| 10 row strips, Flash 3.6 default thinking (first design) | 10 | 82-87% | ~12k in, ~14k out (thinking) |
| 10 row strips, minimal/low thinking | 10 | 80-83% | ~12k in, ~0.6k out |
| **1 whole-grid image, Flash 3.6, minimal thinking (chosen)** | **1** | **83-85%** | **~1.2k in, ~0.5k out** |
| 1 grid, Flash 3.6 low / 3.7 low / 3.8 low | 1 | 82-87% | same (all within noise) |
| 1 grid, hi-res / default thinking / Pro | 1 | 82-84% | no better, slower, dearer |
| 1 grid, Flash-Lite 3.1 | 1 | 81% | cheaper, worse |
| Gemma 4 26B (grid / rows) | 1 / 10 | 44% / 58% | far too inaccurate |

Through the real browser path (canvas-straightened grid, thinking minimal) on the Eagles/Commanders sheet: 89/100 exact vs the hand-typed fixture, 15 s end to end (the row-strip design scored 72-74/100 in 50-65 s). Photo read (teams/digits/corners) is unchanged by minimal thinking on the dev sheets. Price (Gemini 3.6/3.7/3.8 Flash, intro to 2026-12-31): $0.75 in / $3.75 out per 1M tokens, doubling 2027-01-01; a whole sheet (photo read + names) is about half a cent.

### Free local OCR (no AI model calls), same 300 squares, one straightened crop per square (`ocr_eval.py`)
| Engine | exact | word-search hits |
|---|---|---|
| RapidOCR (PaddleOCR models, ONNX, CPU) | 3.0% | 5.9% |
| TrOCR base-handwritten (Hugging Face, CPU; loaded with a "newly initialized weights" warning, so treat as indicative) | 1.7% | 2.8% |
| Gemini 3.6 Flash, one grid call (chosen) | 83-85% | 88% |

Printed-text OCR cannot read cursive in colored ink over ruled lines, and the handwriting model is trained on clean single black lines. Local OCR is not viable for the names. Fine-tuning one would need thousands of labeled squares we do not have.

### Live-sheet audit (2026-11-03, sheet 5g-FWYR..., the Eagles/Commanders photo through the deployed one-call path)
The owner checked all 100 names against straightened row strips (`audit.py`). Saved (one-call Flash, minimal thinking): 99/100 vs the owner's list; Sonnet second opinion 91/100. CAUTION: the review boxes were prefilled with the saved reading, so unnoticed errors count as right and 99% overstates accuracy (same photo scored 89/100 against an independent transcription; true accuracy is probably 85-90%). The owner's verdict: the misses are about one letter wrong, and 1-2 squares are unreadable even to a person. Decision closed: Flash, one call, minimal thinking; fixes via the square panel and "Maybe also".
