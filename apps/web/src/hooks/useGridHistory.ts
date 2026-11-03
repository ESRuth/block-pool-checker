import { useRef, useState } from "react";
import type { Quad } from "@bpc/engine";
import type { Sheet } from "../lib/sheetApi";

/** Where the grid was before each move (newest last), so a slip can be undone. Keeps the last 20. */
export function useGridHistory(update: (patch: Partial<Sheet>) => void) {
  const stack = useRef<Quad[]>([]);
  const [count, setCount] = useState(0);
  const push = (corners: Quad) => {
    stack.current = [...stack.current.slice(-19), corners];
    setCount(stack.current.length);
  };
  const undo = () => {
    const prev = stack.current.pop();
    setCount(stack.current.length);
    if (prev) update({ corners: prev });
  };
  return { push, undo, count };
}
