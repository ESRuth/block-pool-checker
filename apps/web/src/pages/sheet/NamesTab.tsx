import { NamesGrid } from "./NamesGrid";
import type { NameEntry } from "../../lib/sheetApi";

/** Every name, laid out like the sheet. */
export function NamesTab(props: { names: Record<string, NameEntry>; mine: Set<string>; onOpen: (block: string) => void }) {
  return (
    <div>
      <h2>All names</h2>
      <p className="sub">Laid out like the sheet. A dashed block hasn't been checked by anyone yet. Tap one to see it close up and fix it.</p>
      <NamesGrid {...props} />
    </div>
  );
}
