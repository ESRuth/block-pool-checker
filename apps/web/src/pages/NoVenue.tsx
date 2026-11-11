/** /new without a venue: sheets are made from a venue's page, so point there. */
export function NoVenue() {
  return (
    <main>
      <header className="top">
        <a href="/" className="back" aria-label="Home">
          ‹
        </a>
        <h1>New sheet</h1>
      </header>
      <p className="msg">Sheets are made on a venue. Open your venue from the home page and choose "Post a new sheet" or "Add a sheet from a photo".</p>
      <a className="bigbtn" href="/">
        Go to the home page
      </a>
    </main>
  );
}
