import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { readToDigits } from "@bpc/engine";
import type { Access } from "../access.js";
import { IMAGE_TYPES, ReaderError, type ImageType, type Reader } from "../reader.js";

const capReply = { error: "You've reached today's limit for reading photos. It resets tomorrow; ask the owner if you need more." };
/** One straightened image of the whole grid, base64. */
const NamesBody = z.object({ image: z.string().min(1).max(3_000_000) });

/** The two routes that spend money on the model. Both need a person (owner or invited) and count against the daily cap. Nothing sent here is stored or logged. */
export function readingRoutes(app: Hono, a: Access, reader: Reader | undefined) {
  /** Phone photos are downscaled in the browser before upload; this is the hard cap. */
  app.post("/api/read", bodyLimit({ maxSize: 8 * 1024 * 1024, onError: (c) => c.json({ error: "image too large" }, 413) }), async (c) => {
    if (!reader) return c.json({ error: "photo reading is not enabled" }, 503);
    const who = await a.access(c);
    if (!who) return c.json({ error: "access code required" }, 403);
    if (!(await a.underReadCap(who))) return c.json(capReply, 429);
    const type = (c.req.header("Content-Type") ?? "").split(";")[0]!.trim() as ImageType;
    if (!IMAGE_TYPES.includes(type)) return c.json({ error: "send the image as the request body with Content-Type image/jpeg, image/png or image/webp" }, 415);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length === 0) return c.json({ error: "empty body" }, 400);
    try {
      const { read, model, usage } = await reader.read(bytes, type);
      const { digits, problems } = readToDigits(read);
      // digits is null unless every row is a clean 0-9 permutation: the client must have a person fix the listed rows.
      return c.json({ read, digits, problems, model, usage });
    } catch (e) {
      if (e instanceof ReaderError) return c.json({ error: "could not read the photo, try again" }, 502);
      throw e;
    }
  });

  /** Returns the 100 names (10 rows of 10, null = unreadable). */
  app.post("/api/read-names", bodyLimit({ maxSize: 4 * 1024 * 1024, onError: (c) => c.json({ error: "too large" }, 413) }), async (c) => {
    if (!reader) return c.json({ error: "photo reading is not enabled" }, 503);
    const who = await a.access(c);
    if (!who) return c.json({ error: "access code required" }, 403);
    if (!(await a.underReadCap(who))) return c.json(capReply, 429);
    const { image } = NamesBody.parse(await c.req.json());
    try {
      const out = await reader.readGrid(new Uint8Array(Buffer.from(image, "base64")), "image/jpeg");
      return c.json(out);
    } catch (e) {
      if (e instanceof ReaderError) return c.json({ error: "could not read the names, try again" }, 502);
      throw e;
    }
  });
}
