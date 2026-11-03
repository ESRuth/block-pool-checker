/** A short user guide for the page. */
export function HelpTab({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="guide">
      <h2>How this page works</h2>
      <ul>
        <li>
          <b>Winners.</b> The badges 1, 2, 3 and F are the end of the first quarter, halftime, the end of the third quarter and the final. Each shows the score
          and who holds the winning square. A period that is still being played says “winning now” and can change.
        </li>
        <li>
          <b>Names.</b> The app reads the names from the photo and can get one wrong. A <b>?</b> beside a winner's name means nobody has checked it yet: tap it
          when it's right, or retype it.
        </li>
        {canEdit && (
          <li>
            <b>The grid.</b> The pink lines need to sit on the printed squares of the sheet. If they don't, drag the circle at each corner, or tap “Snap to
            lines”. Your changes save by themselves.
          </li>
        )}
        <li>
          <b>Squares.</b> Type a name to outline matching squares, or tap any square on the photo to see it close up{canEdit ? ", fix its name" : ""} and mark
          it as yours. Once you have marked squares, you also see which periods they have won, which scoring plays could put one of them in the lead during a
          live game, and the score digits each one needs.
        </li>
        <li>
          <b>Names tab.</b> All 100 names laid out like the sheet, so a mistake is easy to spot.
        </li>
        <li>
          <b>The score.</b> It updates on its own while the game is on. If the page can't reach the server, it says so and shows the last score it had.
        </li>
      </ul>
    </div>
  );
}
