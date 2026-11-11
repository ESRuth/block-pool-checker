import { GuideBlockView } from "../components/GuideBlocks";
import { PRIVACY, PRIVACY_INTRO, PRIVACY_UPDATED } from "../lib/privacy";

/** The privacy policy, at /privacy (no sign-in). The text is in lib/privacy.ts (also written out as docs/PRIVACY.md). */
export function Privacy() {
  return (
    <main className="guide helppage">
      <header className="top">
        <a href="/" className="back" aria-label="Home">
          ‹
        </a>
        <h1>Privacy policy</h1>
      </header>
      <p className="sub">Last updated {new Date(`${PRIVACY_UPDATED}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "long" })}.</p>
      <p className="sub">{PRIVACY_INTRO}</p>
      <nav aria-label="Sections" className="toc">
        {PRIVACY.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.title}
          </a>
        ))}
      </nav>
      {PRIVACY.map((s) => (
        <section key={s.id} id={s.id} className="sec" aria-labelledby={`${s.id}-h`}>
          <h2 id={`${s.id}-h`}>{s.title}</h2>
          {s.blocks.map((b, i) => (
            <GuideBlockView key={i} b={b} />
          ))}
        </section>
      ))}
    </main>
  );
}
