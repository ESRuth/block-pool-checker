import { useEffect, useRef } from "react";
import { apply, gridTransform, type Quad } from "@bpc/engine";

const NAMES = ["top-left", "top-right", "bottom-right", "bottom-left"];

import type { Box } from "../lib/boxes";

interface Props {
  url: string;
  width: number;
  height: number;
  corners: Quad;
  onChange: (c: Quad) => void;
  markers?: Box[];
  showGrid?: boolean;
  /** Draggable corner circles; hide them once the grid is right. */
  handles?: boolean;
  /** Blocks to light up: `mine` ones strongly, the rest as search matches. */
  highlights?: Array<{ quad: Quad; kind: "mine" | "match" | "maybe" | "sel" }>;
  /** Called when a corner drag begins, so the caller can remember where the grid was (for undo). */
  onDragStart?: () => void;
  /** A tap (not a drag or scroll) on the photo, in photo pixels. */
  onTap?: (point: [number, number]) => void;
}

/**
 * Where a winner's box and its period number are drawn, in photo pixels. The number is a small rounded badge sitting entirely inside the box,
 * in its bottom-right corner (just clear of the outline), following the grid's perspective.
 */
function markerShape(m: Box) {
  const [p0, p1, p2, p3] = m.quad;
  const cw = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const unit = (a: readonly number[], b: readonly number[]) => {
    const d = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) || 1;
    return [(b[0]! - a[0]!) / d, (b[1]! - a[1]!) / d] as const;
  };
  const left = unit(p2, p3); // along the bottom edge, towards the left
  const up = unit(p2, p1); // along the right edge, upwards
  const side = cw * 0.28;
  const inset = cw / 40 + cw / 60; // half the outline's width plus a hair, so the badge sits inside it
  const from = side * 1.12 * m.nest + inset; // boxes sharing a block: badges side by side, leftwards
  const at = (l: number, u: number) => [p2[0] + left[0] * l + up[0] * u, p2[1] + left[1] * l + up[1] * u] as const;
  const corners = [at(from, inset), at(from + side, inset), at(from + side, inset + side), at(from, inset + side)];
  const mid = at(from + side / 2, inset + side / 2);
  return {
    cw,
    side,
    pts: m.quad.map((p) => p.join(",")).join(" "),
    badge: corners.map((c) => c.join(",")).join(" "),
    cx: mid[0],
    cy: mid[1],
    dash: m.dashed ? `${cw / 4} ${cw / 8}` : undefined,
  };
}

/** The user's photo with the 10x10 grid drawn on it (perspective-correct) and four draggable corner handles. */
export function GridOverlay({
  url,
  width,
  height,
  corners,
  onChange,
  markers = [],
  showGrid = true,
  handles = true,
  highlights = [],
  onTap,
  onDragStart,
}: Props) {
  const svg = useRef<SVGSVGElement>(null);
  // Touch-action does not work on shapes inside an SVG, so without this the browser takes over a corner drag as a page scroll
  // after a few pixels and cancels it. A non-passive touchstart that starts on a corner circle claims the gesture; touches
  // anywhere else on the photo are left alone, so the page still scrolls.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const claim = (e: TouchEvent) => {
      if ((e.target as Element | null)?.classList?.contains("hit")) e.preventDefault();
    };
    el.addEventListener("touchstart", claim, { passive: false });
    return () => el.removeEventListener("touchstart", claim);
  }, []);
  const { toPhoto } = gridTransform(corners);
  const line = (a: [number, number], b: [number, number], k: string, edge: boolean) => {
    const [x1, y1] = apply(toPhoto, a),
      [x2, y2] = apply(toPhoto, b);
    return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} className={edge ? "gl edge" : "gl"} strokeWidth={width / (edge ? 320 : 600)} />;
  };
  const lines = [];
  for (let i = 0; i <= 10; i++) {
    lines.push(line([i, 0], [i, 10], `v${i}`, i === 0 || i === 10));
    lines.push(line([0, i], [10, i], `h${i}`, i === 0 || i === 10));
  }

  const toImage = (e: React.PointerEvent): [number, number] => {
    const el = svg.current!;
    const pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(el.getScreenCTM()!.inverse());
    return [p.x, p.y];
  };
  // Where inside the circle the finger landed, so the corner follows the finger instead of jumping to it.
  const grab = useRef<[number, number]>([0, 0]);
  const start = (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onDragStart?.();
    const [x, y] = toImage(e);
    const c = corners[i]!;
    grab.current = [c[0] - x, c[1] - y];
  };
  const drag = (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const [x, y] = toImage(e);
    // A corner cannot leave the photo: past the edge it would vanish and could not be grabbed again.
    const nx = Math.min(width, Math.max(0, x + grab.current[0])),
      ny = Math.min(height, Math.max(0, y + grab.current[1]));
    const next = corners.map((c, j) => (j === i ? [nx, ny] : c)) as unknown as Quad;
    onChange(next);
  };
  const r = width / 60;

  return (
    <div
      className="photo-wrap"
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (!onTap || (e.target as Element).classList?.contains("hit")) return;
        const r = e.currentTarget.getBoundingClientRect();
        onTap([((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height]);
      }}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <img src={url} alt="Your pool sheet" draggable={false} />
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} className="overlay" aria-label="Grid over your photo">
        {showGrid && lines}
        {highlights.map((h, i) => (
          <polygon key={i} points={h.quad.map((p) => p.join(",")).join(" ")} className={`hl ${h.kind}`} strokeWidth={width / 500} strokeLinejoin="round" />
        ))}
        {/* Outlines only: the names inside the blocks must stay readable. A white halo under each colour line keeps it visible on any paper. */}
        {markers.map((m) => {
          const g = markerShape(m);
          return (
            <g key={m.period}>
              <polygon points={g.pts} fill="none" stroke="#fff" strokeWidth={g.cw / 10} strokeLinejoin="round" strokeDasharray={g.dash} />
              <polygon
                points={g.pts}
                fill="none"
                stroke={m.color}
                strokeWidth={g.cw / 20}
                strokeLinejoin="round"
                strokeDasharray={g.dash}
                data-marker={m.period}
              />
            </g>
          );
        })}
        {/* The period number is a small block inside each box's bottom-right corner, drawn after every box so no neighbour's outline covers it.
            Colour alone is never the cue; boxes sharing a block have their numbers side by side. */}
        {markers.map((m) => {
          const g = markerShape(m);
          return (
            <g key={m.period} data-tag={m.period}>
              <polygon points={g.badge} fill={m.color} stroke="#fff" strokeWidth={g.side / 10} strokeLinejoin="round" />
              <text
                x={g.cx}
                y={g.cy}
                fill="#fff"
                fontSize={g.side * 0.78}
                fontWeight="800"
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="system-ui, sans-serif"
              >
                {m.label}
              </text>
            </g>
          );
        })}
        {handles &&
          corners.map((c, i) => (
            <g key={i}>
              <circle cx={c[0]} cy={c[1]} r={r} className="handle" strokeWidth={width / 400} />
              <circle
                cx={c[0]}
                cy={c[1]}
                r={r * 2.2}
                className="hit"
                role="slider"
                aria-label={`Drag the ${NAMES[i]} corner`}
                onPointerDown={start(i)}
                onPointerMove={drag(i)}
              />
            </g>
          ))}
      </svg>
    </div>
  );
}
