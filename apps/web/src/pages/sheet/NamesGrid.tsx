import type { NameEntry } from "../../lib/sheetApi";

/** Every name on the sheet laid out like the sheet itself, so mistakes are easy to spot. Tap one to open it. */
export function NamesGrid({ names, mine, onOpen }: { names: Record<string, NameEntry>; mine: Set<string>; onOpen: (block: string) => void }) {
  const blocks: string[] = [];
  for (let r = 1; r <= 10; r++) for (let c = 1; c <= 10; c++) blocks.push(`${r},${c}`);
  return (
    <div className="ng" role="grid" aria-label="All names">
      {blocks.map((k) => {
        const n = names[k];
        const cls = [mine.has(k) ? "mine" : "", !n?.text ? "empty" : "", n && !n.confirmed && n.text ? "unsure" : ""].join(" ").trim();
        return (
          <button key={k} className={cls} onClick={() => onOpen(k)} aria-label={`Open block: ${n?.text || "empty"}`}>
            {n?.text || "·"}
          </button>
        );
      })}
    </div>
  );
}
