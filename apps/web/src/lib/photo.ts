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

export async function loadPhoto(file: Blob, maxDim = 2048): Promise<LoadedPhoto> {
  const bmp = await decode(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale),
    height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp.source, 0, 0, width, height);
  bmp.close();
  const gray = rgbaToGray(ctx.getImageData(0, 0, width, height).data, width, height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("could not encode the photo"))), "image/jpeg", 0.9));
  return { blob, width, height, gray, url: URL.createObjectURL(blob) };
}
