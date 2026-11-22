import { rgbaToGray, type Gray } from "@bpc/vision";

export interface LoadedPhoto {
  /** Upright, at most `maxDim` px, re-encoded JPEG: all metadata (GPS, camera, time) is gone. This is what gets uploaded. */
  blob: Blob;
  width: number;
  height: number;
  gray: Gray;
  url: string;
}

/** Decode a picked file, apply its EXIF rotation, downscale and re-encode. The original file is never uploaded. */
async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    // Older Safari: let an <img> apply the photo's rotation.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  }
}

/** Turn a canvas into the photo that gets used: an upright JPEG with no metadata, plus a grayscale copy for snapping the grid. */
async function fromCanvas(canvas: HTMLCanvasElement): Promise<LoadedPhoto> {
  const { width, height } = canvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const gray = rgbaToGray(ctx.getImageData(0, 0, width, height).data, width, height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("could not encode the photo"))), "image/jpeg", 0.9));
  return { blob, width, height, gray, url: URL.createObjectURL(blob) };
}

export async function loadPhoto(file: Blob, maxDim = 2048): Promise<LoadedPhoto> {
  const bmp = await decode(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale),
    height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d", { willReadFrequently: true })!.drawImage(bmp.source, 0, 0, width, height);
  bmp.close();
  return fromCanvas(canvas);
}

/** What the person did to a photo before using it: quarter turns clockwise, then a crop (fractions of the turned photo, 0 to 1). */
export interface PhotoEdit {
  turns: number;
  crop: { l: number; t: number; r: number; b: number };
}
export const FULL_CROP = { l: 0, t: 0, r: 1, b: 1 };
export const isUnedited = (e: PhotoEdit) => e.turns % 4 === 0 && e.crop.l === 0 && e.crop.t === 0 && e.crop.r === 1 && e.crop.b === 1;

/** The size of a photo after `turns` quarter turns. */
export const turnedSize = (w: number, h: number, turns: number): [number, number] => (turns % 2 === 0 ? [w, h] : [h, w]);

/** Draw an image turned by `turns` quarter turns clockwise onto a canvas of the turned size (scaled so its longest side is at most `maxDim`). */
export function drawTurned(canvas: HTMLCanvasElement, img: CanvasImageSource, w: number, h: number, turns: number, maxDim = Infinity) {
  const [tw, th] = turnedSize(w, h, turns);
  const k = Math.min(1, maxDim / Math.max(tw, th));
  canvas.width = Math.max(1, Math.round(tw * k));
  canvas.height = Math.max(1, Math.round(th * k));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(((turns % 4) * Math.PI) / 2);
  ctx.drawImage(img, (-w * k) / 2, (-h * k) / 2, w * k, h * k);
  ctx.restore();
}

/** Apply a rotate and crop to a loaded photo, giving a new one (the original is left alone). Nothing to do returns the same photo. */
export async function editPhoto(p: LoadedPhoto, e: PhotoEdit): Promise<LoadedPhoto> {
  if (isUnedited(e)) return p;
  const img = new Image();
  img.src = p.url;
  await img.decode();
  const turned = document.createElement("canvas");
  drawTurned(turned, img, p.width, p.height, e.turns);
  const x = Math.round(e.crop.l * turned.width),
    y = Math.round(e.crop.t * turned.height);
  const w = Math.max(1, Math.round((e.crop.r - e.crop.l) * turned.width)),
    h = Math.max(1, Math.round((e.crop.b - e.crop.t) * turned.height));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d", { willReadFrequently: true })!.drawImage(turned, x, y, w, h, 0, 0, w, h);
  return fromCanvas(out);
}
