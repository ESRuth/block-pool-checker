import { GuideBlockView } from "../components/GuideBlocks";
import { GUIDE, GUIDE_INTRO } from "../lib/guide";

/** The user guide, at /help. The text is in lib/guide.ts (also written out as docs/GUIDE.md). */
export function Help() {
  return (
    <main className="guide helppage">
      <header className="top">
        <a href="/" className="back" aria-label="Home">
          ‹
        </a>
        <h1>Help</h1>
      </header>
      <p className="sub">{GUIDE_INTRO}</p>
      <nav aria-label="Sections" className="toc">
        {GUIDE.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.title}
          </a>
        ))}
        <a href="/privacy">Privacy policy</a>
      </nav>
      {GUIDE.map((s) => (
        <section key={s.id} id={s.id} className="sec" aria-labelledby={`${s.id}-h`}>
          <h2 id={`${s.id}-h`}>{s.title}</h2>
          <p className="sub">{s.for}</p>
          {s.blocks.map((b, i) => (
            <GuideBlockView key={i} b={b} />
          ))}
        </section>
      ))}
    </main>
  );
}
