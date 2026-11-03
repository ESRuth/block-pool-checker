import { apply, homography, invert, type Quad } from "@bpc/engine";

export interface Gray {
  /** 0-255 luminance, row-major. */
  data: Float32Array;
  width: number;
  height: number;
}

/** RGBA pixels (e.g. canvas ImageData or a decoded JPEG) to luminance. */
export function rgbaToGray(rgba: ArrayLike<number>, width: number, height: number): Gray {
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
  return { data, width, height };
}

/**
 * Resample the area described by `src` (a quad in the source image) into a width x height rectangle,
 * with `margin` pixels of surrounding image kept on every side. Returns the image and the quad->warped transform.
 */
export function warpQuad(img: Gray, src: Quad, outW: number, outH: number, marginX: number, marginY: number) {
  const dst: Quad = [
    [marginX, marginY],
    [marginX + outW, marginY],
    [marginX + outW, marginY + outH],
    [marginX, marginY + outH],
  ];
  const M = homography(src, dst);
  const inv = invert(M);
  const W = outW + 2 * marginX,
    H = outH + 2 * marginY;
  const out = new Float32Array(W * H);
  const { data, width, height } = img;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [u, v] = apply(inv, [x, y]);
      // bilinear sample, edges replicated
      const x0 = Math.floor(u),
        y0 = Math.floor(v),
        fx = u - x0,
        fy = v - y0;
      const cx0 = Math.min(width - 1, Math.max(0, x0)),
        cx1 = Math.min(width - 1, Math.max(0, x0 + 1));
      const cy0 = Math.min(height - 1, Math.max(0, y0)),
        cy1 = Math.min(height - 1, Math.max(0, y0 + 1));
      out[y * W + x] =
        data[cy0 * width + cx0]! * (1 - fx) * (1 - fy) +
        data[cy0 * width + cx1]! * fx * (1 - fy) +
        data[cy1 * width + cx0]! * (1 - fx) * fy +
        data[cy1 * width + cx1]! * fx * fy;
    }
  }
  return { gray: { data: out, width: W, height: H } as Gray, M };
}

/** Small separable Gaussian, edges replicated. */
export function gaussianBlur(img: Gray, sigma: number): Float32Array {
  const r = Math.ceil(3 * sigma);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i]! /= sum;
  const { width: W, height: H, data } = img;
  const tmp = new Float32Array(data.length),
    out = new Float32Array(data.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += data[y * W + Math.min(W - 1, Math.max(0, x + i))]! * k[i + r]!;
      tmp[y * W + x] = a;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += tmp[Math.min(H - 1, Math.max(0, y + i)) * W + x]! * k[i + r]!;
      out[y * W + x] = a;
    }
  return out;
}

/** Running-sum box blur applied `passes` times per axis: approximates a Gaussian cheaply for large sigma. */
export function boxBlur(img: Gray, radius: number, passes = 3): Float32Array {
  const { width: W, height: H } = img;
  let cur = Float32Array.from(img.data);
  const line = (src: Float32Array, dst: Float32Array, start: number, stride: number, n: number) => {
    const win = 2 * radius + 1;
    let acc = 0;
    for (let i = -radius; i <= radius; i++) acc += src[start + Math.min(n - 1, Math.max(0, i)) * stride]!;
    for (let i = 0; i < n; i++) {
      dst[start + i * stride] = acc / win;
      acc += src[start + Math.min(n - 1, i + radius + 1) * stride]! - src[start + Math.max(0, i - radius) * stride]!;
    }
  };
  for (let p = 0; p < passes; p++) {
    const tmp = new Float32Array(cur.length);
    for (let y = 0; y < H; y++) line(cur, tmp, y * W, 1, W);
    const out = new Float32Array(cur.length);
    for (let x = 0; x < W; x++) line(tmp, out, x, W, H);
    cur = out;
  }
  return cur;
}
