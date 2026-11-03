import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import { ReadResultSchema, type ReadResult } from "@bpc/engine";

export const READ_PROMPT = `You are reading a photo of a handwritten football "squares" pool sheet. It has a 10x10 grid of squares with people's names (and sometimes phone numbers) written in them. IGNORE all names and phone numbers: never transcribe them.

Digit labels surround the grid:
- Across the TOP: either ONE row of 10 digits (a shared set used for every payout), or FOUR rows of 10 digits whose left end is labeled 1, 2, 3, F (1 = end of 1st quarter, 2 = halftime, 3 = end of 3rd quarter, F = final).
- Down the LEFT: either ONE column of 10 digits, or FOUR columns of 10 digits labeled 1, 2, 3, F at the top. Each row of the grid has its digits written left to right in those columns; read each column from top to bottom.
- Team names may be written near the top edge (the team whose digits run across the top) and the left edge (down the side).

Return ONLY a JSON object, no other text:
{
  "top_team": string or null,
  "left_team": string or null,
  "digit_sets": "shared" or "per_period",
  "top":  {"shared": [10 digits]}  or  {"Q1": [...], "Half": [...], "Q3": [...], "Final": [...]},
  "left": same shape as "top",
  "grid_corners": [[x,y],[x,y],[x,y],[x,y]],
  "grid_complete": true or false,
  "uncertain": [short notes about anything you could not read clearly; never include names]
}

Rules:
- Read digits exactly as written. Never guess or fill in a digit you cannot read: use null for it and add a note to "uncertain".
- Each list of 10 digits normally contains each of 0-9 exactly once. If what you read does not, look again, but still report what you actually see.
- Team names: only if actually written on the sheet in the photo. If a team name is not visible, use null. Do not infer it from anything else.
- grid_corners: the four outer corners of the 10x10 grid of squares (EXCLUDE the digit labels), in order top-left, top-right, bottom-right, bottom-left, as [x,y] normalized to 0-1000 of the image width and height (0,0 = top-left of the image). If part of the grid is cut off by the edge of the photo, give your best estimate of where that corner would be (it may be outside 0-1000) and set grid_complete to false.
`;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export class ReaderError extends Error {}

export const GRID_PROMPT = `This image is a handwritten football "squares" pool sheet's 10x10 grid of squares, straightened. Each square holds a person's name, sometimes with a phone number, sometimes empty.
Transcribe the name in each square exactly as written (keep initials, "+", "&", "/" and "and"). NEVER write a phone number. Empty square: "". Cannot read it: null; do not guess.
Return ONLY JSON: {"rows": [10 rows, top to bottom, each a list of 10 names, left to right]}`;

/** Reads teams, digit rows and rough grid corners from a pool photo. The photo is never stored or logged. */
export interface Reader {
  read(image: Uint8Array, mimeType: ImageType): Promise<{ read: ReadResult; model: string; usage?: { in?: number; out?: number } }>;
  /** Transcribe every name from ONE straightened image of the 10x10 grid: 10 rows of 10, top to bottom, left to right. Unreadable = null, never guessed. */
  readGrid(image: Uint8Array, mimeType: ImageType): Promise<{ names: Array<Array<string | null>>; model: string }>;
}

/** The 10 names of one row; empty squares come back as "" and unreadable ones as null. */
export function parseGrid(text: string): Array<Array<string | null>> {
  const parsed = z.object({ rows: z.array(z.array(z.string().nullable())) }).safeParse(parseModelJson(text));
  if (!parsed.success) throw new ReaderError("model answer did not match the expected shape");
  const rows = parsed.data.rows.slice(0, 10).map((r) => {
    const names = r.slice(0, 10).map((n) => (n === null ? null : n.trim().slice(0, 60)));
    while (names.length < 10) names.push(null);
    return names;
  });
  while (rows.length < 10) rows.push(Array<string | null>(10).fill(null));
  return rows;
}

function parseModelJson(text: string): unknown {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new ReaderError("model returned no JSON");
  try {
    return JSON.parse(m[0]);
  } catch {
    throw new ReaderError("model returned invalid JSON");
  }
}

export function parseRead(text: string): ReadResult {
  const parsed = ReadResultSchema.safeParse(parseModelJson(text));
  if (!parsed.success) throw new ReaderError("model answer did not match the expected shape");
  return parsed.data;
}

/** Gemini on Vertex AI (global endpoint). Auth is the ambient Google identity: gcloud login locally, the service account on Cloud Run. */
export class GeminiReader implements Reader {
  private readonly auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  constructor(
    private readonly project: string,
    private readonly model = "gemini-3.6-flash",
    private readonly fetcher: typeof fetch = fetch,
    /** 3.6 Flash allows "minimal"; 3.7 and 3.8 Flash need "low". */
    private readonly thinking: string = "minimal",
  ) {}

  private async generate(parts: unknown[]) {
    const token = await this.auth.getAccessToken();
    const url = `https://aiplatform.googleapis.com/v1/projects/${this.project}/locations/global/publishers/google/models/${this.model}:generateContent`;
    const res = await this.fetcher(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "x-goog-user-project": this.project, "Content-Type": "application/json" },
      // Minimal thinking: measured on real sheets, thinking adds cost and time but no accuracy for reading handwriting.
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { maxOutputTokens: 16384, responseMimeType: "application/json", thinkingConfig: { thinkingLevel: this.thinking } },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new ReaderError(`reader upstream ${res.status}`); // never include the body: it can echo the request
    const d = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    const text = (d.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
    const u = d.usageMetadata;
    return { text, usage: { in: u?.promptTokenCount, out: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0) } };
  }

  async read(image: Uint8Array, mimeType: ImageType) {
    const { text, usage } = await this.generate([{ inlineData: { mimeType, data: Buffer.from(image).toString("base64") } }, { text: READ_PROMPT }]);
    return { read: parseRead(text), model: this.model, usage };
  }

  async readGrid(image: Uint8Array, mimeType: ImageType) {
    const { text } = await this.generate([{ inlineData: { mimeType, data: Buffer.from(image).toString("base64") } }, { text: GRID_PROMPT }]);
    return { names: parseGrid(text), model: this.model };
  }
}

/**
 * Offline stand-in for local development and UI tests (READER=stub): returns recorded answers for the Eagles/Commanders sample and
 * never calls a model, so testing the app costs nothing.
 */
export class StubReader implements Reader {
  constructor(private readonly recorded: { read: ReadResult; names: Array<Array<string | null>> }) {}
  async read() {
    return { read: this.recorded.read, model: "stub" };
  }
  async readGrid() {
    return { names: this.recorded.names, model: "stub" };
  }
}
