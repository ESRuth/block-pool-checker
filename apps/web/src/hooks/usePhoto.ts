import { useEffect, useState } from "react";
import type { Gray } from "@bpc/vision";
import { loadPhoto } from "../lib/photo";
import { photoBlob } from "../lib/sheetApi";

/** The sheet's photo decoded once as an image, for close-ups and for reading names. */
export function usePhotoImage(url: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) return;
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = url;
  }, [url]);
  return img;
}

/**
 * The sheet's photo as a local address, fetched with the person's key or edit link (an <img> tag cannot send them, and photos can be
 * restricted to the people who run a sheet). Empty until it arrives, or when this viewer is not shown a photo.
 */
export function usePhotoSrc(id: string, token: string, enabled: boolean) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let made = "";
    photoBlob(id, token)
      .then((b) => {
        if (!live) return;
        made = URL.createObjectURL(b);
        setSrc(made);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id, token, enabled]);
  return src;
}

/** The photo as grayscale pixels for snapping the grid. Fetched only when first `wanted` (the grid is shown to an editor). */
export function useGrayPhoto(url: string, wanted: boolean) {
  const [gray, setGray] = useState<Gray | null>(null);
  useEffect(() => {
    if (!wanted || gray || !url) return;
    let live = true;
    fetch(url)
      .then((r) => r.blob())
      .then(loadPhoto)
      .then((p) => live && setGray(p.gray))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [url, wanted, gray]);
  return gray;
}
