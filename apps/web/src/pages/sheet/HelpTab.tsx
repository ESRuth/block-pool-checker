/** A short user guide for the page. */
export function HelpTab({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="guide">
      <h2>How this page works</h2>
      <ul>
        <li>
          <b>Winners.</b> The badges 1, 2, 3 and F are the end of the first quarter, halftime, the end of the third quarter and the final. Each shows the score
          and who holds the winning block. A period that is still being played says “winning now” and can change.
        </li>
        <li>
          <b>Names.</b> The app reads the names from the photo and can get one wrong. A <b>?</b> beside a winner's name means nobody has checked it yet: tap it
          when it's right, or retype it.
        </li>
        {canEdit && (
          <li>
            <b>The grid.</b> The pink lines need to sit on the printed blocks of the sheet. If they don't, drag the circle at each corner, or tap “Snap to
            lines”. Your changes save by themselves.
          </li>
        )}
        <li>
          <b>Blocks.</b> Type a name to outline matching blocks, or tap any block on the photo (when you can see it) to see it close up
          {canEdit ? ", fix its name" : ""} and mark it as yours. Once you have marked blocks, you also see which periods they have won and the score digits
          each one needs.
        </li>
        <li>
          <b>If there's a score next.</b> During a live game, this shows who leads now and who would lead after each kind of score, with the team that has the
          ball listed first when the score feed says who has it.
        </li>
        <li>
          <b>Names tab.</b> All 100 names laid out like the sheet, so a mistake is easy to spot.
        </li>
        <li>
          <b>The score.</b> It updates on its own while the game is on. If the page can't reach the server, it says so and shows the last score it had.
        </li>
      </ul>
      <p className="sub">
        More in the <a href="/help">full guide</a>.
      </p>
    </div>
  );
}
