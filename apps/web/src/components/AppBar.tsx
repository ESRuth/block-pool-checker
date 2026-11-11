import { useAuth } from "../lib/auth";
import { useLocation } from "../lib/router";

/**
 * The bar at the top of every page: where you are in the app and who you are. The owner gets three places (Venues, Sheets, People); a runner has
 * one (their venues), so no tabs; someone with only a PIN gets the name and the two plain pages. These are the app's places; the tabs inside a
 * sheet (Blocks, Names ...) are a different thing and look different.
 */
export function AppBar() {
  const { status, me, signOut } = useAuth();
  const { path } = useLocation();
  const owner = status === "signedIn" && me?.owner;
  const here =
    path === "/sheets"
      ? "/sheets"
      : path === "/people"
        ? "/people"
        : path === "/" || path.startsWith("/v/") || path.startsWith("/s/") || path.startsWith("/new")
          ? "/"
          : "";
  const tabs: Array<[string, string]> = [
    ["/", "Venues"],
    ["/sheets", "Sheets"],
    ["/people", "People"],
  ];
  return (
    <div className="appbar">
      {status === "signedIn" ? (
        <a className="brand" href="/">
          Block Pool Checker
        </a>
      ) : (
        <span className="brand">Block Pool Checker</span> // someone with only a PIN has no home page to go to
      )}
      {owner && (
        <nav aria-label="Owner">
          {tabs.map(([href, label]) => (
            <a key={href} href={href} aria-current={here === href ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
      )}
      <div className="who">
        {status === "signedIn" && me ? (
          // Reopened closed after every move, so a choice from the menu never leaves it hanging open.
          <details className="menu" key={path}>
            <summary>{me.owner && me.name !== "Owner" ? `${me.name} · Owner` : me.name}</summary>
            <div className="menupanel">
              <a href="/">Home</a>
              <a href="/help">Help</a>
              <a href="/privacy">Privacy</a>
              <a href="/signin">Use a different code</a>
              <button className="linkbtn" onClick={signOut}>
                Sign out
              </button>
            </div>
          </details>
        ) : (
          <>
            <a href="/help">Help</a>
            <a href="/privacy">Privacy</a>
          </>
        )}
      </div>
    </div>
  );
}
