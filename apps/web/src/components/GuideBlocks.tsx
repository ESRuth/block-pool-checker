import type { ReactNode } from "react";
import type { GuideBlock } from "../lib/guide";

/** **bold** in guide and policy text. */
function inline(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

/** One paragraph, heading or list of the guide or the privacy policy. */
export function GuideBlockView({ b }: { b: GuideBlock }) {
  if ("p" in b) return <p>{inline(b.p)}</p>;
  if ("h" in b) return <h3>{b.h}</h3>;
  const Tag = "ol" in b ? "ol" : "ul";
  return (
    <Tag>
      {("ol" in b ? b.ol : b.ul).map((t, i) => (
        <li key={i}>{inline(t)}</li>
      ))}
    </Tag>
  );
}
