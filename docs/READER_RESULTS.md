# Reader results

## In short
Reading a sheet from a photo is the one step a model does, so it's the step worth proving.
- **Digits: always right in testing.** Every row of every test sheet, 520 of 520 for each model compared. And a wrong row can't slip through: each row must hold 0 to 9 exactly once, or the app stops and asks.
- **Teams: right** whenever they're written on the sheet. When they aren't, the model says so and the app asks.
- **Names: about 85 to 90% right** on handwriting, which is a hard thing to read. The misses are usually a letter or so off, and a few are unreadable even to a person. That's why names show "?" until someone confirms them, and why the winner's name is checked against the photo.
- **The grid: close, and the weakest part.** The app then snaps it to the printed lines and shows it for you to adjust before anything is scored.
- **Cost: about half a cent per sheet**, and a few seconds to read.

The model only suggests. Everything it reads is checked by a person or by a rule before it counts. The details below are for developers.

How well vision models read a pool sheet, and why the app reads the way it does. The reader is **Gemini 3.6 Flash on Vertex AI**, one call for the photo (teams, digits, grid corners) and one call for all 100 names, with minimal thinking. Names and phone numbers are never requested in the photo read. The model only proposes; a person confirms.

## Photo read: teams, digits, corners
Measured on 4 real sheets x 4 models x 2 runs (32 calls) with the same prompt, against truth files confirmed by the sheet's owner. Claude was called through the Anthropic API and Gemini through Vertex AI (global endpoint).

| Model | Digits correct | Teams | Median time | Tokens in/out | Cost/photo |
|---|---|---|---|---|---|
| Claude Sonnet 5.5 | 520/520 | all correct (null when not visible) | 9s | ~4.9k / ~1.1k | ~$0.02 (at $2/$10 per MTok) |
| Claude Haiku 5.5 | 520/520 | missed "CHIEFS" (2/2 runs) | 7s | ~4.9k / ~1.5k | not priced |
| Gemini 3.6 Flash | 520/520 | all correct | 12s | ~1.7k / ~2-3k (incl. thinking) | not priced |
| Gemini 3.1 Pro Preview | 520/520 | all correct | 7s (max 79s) | ~1.7k / 0.4-4.5k | not priced |

- **Digits are solved.** 100% for every model, shared versus per-period detected correctly, every row a valid 0-9 permutation. Seven further unseen photos (five distinct sheets) were read by three readers with identical digits on every photo; agreement is strong evidence but not human confirmation.
- **Teams.** Models correctly return null when no team name is visible. Only Haiku missed a visible name. On some sheets the names are written ("PATRIOTS/RAMS", "NFC-BUCS/AFC-CHIEFS", "PHILA EAGLES"); on others they are absent, so the app asks or suggests games.
- **Corners are the weak point.** Judged by eye on overlays:
  - Eagles/Commanders against the fixture corners (fraction of image width): Sonnet 0.5%, Gemini Flash 1.0%, Gemini Pro 4.2%, Haiku 12%.
  - Chiefs: both Claude models included the digit-label bands in the grid, shifting every block. Gemini Flash fit the blocks.
  - Chargers: Gemini Flash fit well; Sonnet narrowed toward the right and drifted.
  - Patriots (tilted, right edge cropped): all approximately right; the 10th column is partly outside the photo. Flash still reports `grid_complete: true` on it, so the model's own flag cannot be trusted.
  - Even the best fits drift by up to about a block at the edges (paper curl, hand-ruled lines).

Why Flash: best corners overall, correct teams and digits, low cost, and one provider. Haiku and Gemini Pro are not used. Claude reading names was worse and costlier than Flash.

## Grid placement
Snapping the model's corners onto the detected grid lines (`packages/vision`):
- **Good starts get better.** Flash corners moved only 0.06-0.5 of a block and then sit on the printed grid.
- **Bad starts are not rescued.** A start that includes the digit-label bands stays wrong, because the label bands share the grid's line spacing and line evidence alone cannot tell where the blocks begin.
- **Limits.** The fit (translation and spacing per axis) fixes sideways or size errors up to about 0.4 block in 11 of 12 synthetic cases, can lock onto a wrong alignment in the 12th with an unchanged evidence score, and does not fix per-corner errors. The search reach is 0.45 block; a wider search snapped a whole block off. Residual error on hand-ruled sheets is probably 0.1-0.2 block.
- **Disagreement between models is a usable confidence signal.** Corner distance between Sonnet and Flash: Commanders 0.13 block, Patriots 0.32, Chargers 0.34, Chiefs 1.46 (the bad one). A threshold around 0.6 block separates them on this small sample.
- **Cropped grids.** When the 10th column is outside the photo a winner there cannot be marked; the app says so.

So the marked photo and drag-to-adjust are the real safety net, not the snapper.

## Name reading
Scored on 3 owner-verified sheets (300 blocks), exact match ignoring case and punctuation; run-to-run noise is about ±3 points.

| Setup | calls/sheet | exact | tokens/sheet |
|---|---|---|---|
| 10 row strips, Flash 3.6 default thinking | 10 | 82-87% | ~12k in, ~14k out (thinking) |
| 10 row strips, minimal/low thinking | 10 | 80-83% | ~12k in, ~0.6k out |
| **1 whole-grid image, Flash 3.6, minimal thinking (used)** | **1** | **83-85%** | **~1.2k in, ~0.5k out** |
| 1 grid, Flash 3.6 low / 3.7 low / 3.8 low | 1 | 82-87% | same (all within noise) |
| 1 grid, hi-res / default thinking / Pro | 1 | 82-84% | no better, slower, dearer |
| 1 grid, Flash-Lite 3.1 | 1 | 81% | cheaper, worse |
| Gemma 4 26B (grid / rows) | 1 / 10 | 44% / 58% | far too inaccurate |

Through the real browser path (canvas-straightened grid, thinking minimal) on the Eagles/Commanders sheet: 89/100 exact against the hand-typed fixture in 15 s end to end (row strips scored 72-74/100 in 50-65 s). Price (Gemini 3.6/3.7/3.8 Flash, introductory through 2026-12-31): $0.75 in / $3.75 out per 1M tokens, doubling on 2027-01-01. A whole sheet (photo read plus names) is about half a cent.

**Free local OCR** (no model calls), same 300 blocks, one straightened crop per block:

| Engine | exact | word-search hits |
|---|---|---|
| RapidOCR (PaddleOCR models, ONNX, CPU) | 3.0% | 5.9% |
| TrOCR base-handwritten (Hugging Face, CPU; loaded with a "newly initialized weights" warning, so indicative only) | 1.7% | 2.8% |
| Gemini 3.6 Flash, one grid call (used) | 83-85% | 88% |

Printed-text OCR cannot read cursive in coloured ink over ruled lines, and the handwriting model is trained on clean single black lines. Local OCR is not viable for names, and fine-tuning one would need thousands of labelled blocks.

**Accuracy to expect.** An owner checked all 100 names of one sheet against straightened row strips: the saved reading matched 99/100, but the review boxes were prefilled with the saved reading, so unnoticed errors count as right and that figure overstates accuracy. The same photo scored 89/100 against an independent transcription. True accuracy is probably 85-90%; the misses are about one letter wrong, and one or two blocks are unreadable even to a person. Fixes go through the block panel and "Maybe also".
