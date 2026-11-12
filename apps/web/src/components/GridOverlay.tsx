import { useEffect, useRef, useState } from "react";
import { apply, gridTransform, type Quad } from "@bpc/engine";

/** The magnifier is this many CSS pixels across, and shows about this many times the photo's on-screen scale. */
const LOUPE = 120;
const loupeSpan = (photoWidth: number) => (photoWidth / 370) * (LOUPE / 3.5);

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
  // While a corner is dragged, a magnifier floats above the finger (which would otherwise hide the corner): the photo and the grid lines, close up.
  const [loupe, setLoupe] = useState<{ at: [number, number]; screen: [number, number] } | null>(null);
  const start = (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    onDragStart?.();
    const [x, y] = toImage(e);
    const c = corners[i]!;
    grab.current = [c[0] - x, c[1] - y];
    setLoupe({ at: [c[0], c[1]], screen: [e.clientX, e.clientY] });
  };
  const end = () => setLoupe(null);
  const drag = (i: number) => (e: React.PointerEvent<SVGCircleElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const [x, y] = toImage(e);
    // A corner cannot leave the photo: past the edge it would vanish and could not be grabbed again.
    const nx = Math.min(width, Math.max(0, x + grab.current[0])),
      ny = Math.min(height, Math.max(0, y + grab.current[1]));
    const next = corners.map((c, j) => (j === i ? [nx, ny] : c)) as unknown as Quad;
    onChange(next);
    setLoupe({ at: [nx, ny], screen: [e.clientX, e.clientY] });
  };
  const r = width / 45;
  // The arrow keys move a focused corner (a step is 0.25% of the photo's width, ten times that with Shift), so the grid can be fixed without dragging.
  // One undo step for a run of key presses, not one per press.
  const lastKey = useRef(0);
  const nudge = (i: number) => (e: React.KeyboardEvent<SVGCircleElement>) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) * (width / 400);
    if (Date.now() - lastKey.current > 800) onDragStart?.();
    lastKey.current = Date.now();
    const c = corners[i]!;
    const nx = Math.min(width, Math.max(0, c[0] + d[0]! * step)),
      ny = Math.min(height, Math.max(0, c[1] + d[1]! * step));
    onChange(corners.map((p, j) => (j === i ? [nx, ny] : p)) as unknown as Quad);
  };

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
                r={r * 2.4}
                className="hit"
                role="button"
                tabIndex={0}
                aria-label={`Move the ${NAMES[i]} corner: drag it, or use the arrow keys`}
                onKeyDown={nudge(i)}
                onPointerDown={start(i)}
                onPointerMove={drag(i)}
                onPointerUp={end}
                onPointerCancel={end}
              />
            </g>
          ))}
      </svg>
      {loupe && (
        <svg
          className="loupe"
          aria-hidden="true"
          style={{
            left: Math.max(8, Math.min(window.innerWidth - LOUPE - 8, loupe.screen[0] - LOUPE / 2)),
            top: loupe.screen[1] - LOUPE - 56 >= 8 ? loupe.screen[1] - LOUPE - 56 : loupe.screen[1] + 56,
          }}
          viewBox={`${loupe.at[0] - loupeSpan(width) / 2} ${loupe.at[1] - loupeSpan(width) / 2} ${loupeSpan(width)} ${loupeSpan(width)}`}
        >
          <image href={url} width={width} height={height} />
          {lines}
          <line
            x1={loupe.at[0] - loupeSpan(width) / 6}
            x2={loupe.at[0] + loupeSpan(width) / 6}
            y1={loupe.at[1]}
            y2={loupe.at[1]}
            className="cross"
            strokeWidth={loupeSpan(width) / 150}
          />
          <line
            y1={loupe.at[1] - loupeSpan(width) / 6}
            y2={loupe.at[1] + loupeSpan(width) / 6}
            x1={loupe.at[0]}
            x2={loupe.at[0]}
            className="cross"
            strokeWidth={loupeSpan(width) / 150}
          />
        </svg>
      )}
    </div>
  );
}
