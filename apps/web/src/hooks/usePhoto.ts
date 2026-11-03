import { useEffect, useState } from "react";
import type { Gray } from "@bpc/vision";
import { loadPhoto } from "../lib/photo";

/** The sheet's photo decoded once as an image, for close-ups and for reading names. */
export function usePhotoImage(url: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = url;
  }, [url]);
  return img;
}

/** The photo as grayscale pixels for snapping the grid. Fetched only when first `wanted` (the grid is shown to an editor). */
export function useGrayPhoto(url: string, wanted: boolean) {
  const [gray, setGray] = useState<Gray | null>(null);
  useEffect(() => {
    if (!wanted || gray) return;
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
