import { Suspense, lazy } from "react";
import { Home } from "./pages/Home";
import { Join } from "./pages/Join";
import { NewSheet } from "./pages/NewSheet";
import { NoVenue } from "./pages/NoVenue";
import { SheetPage } from "./pages/sheet/SheetPage";

// Pages most people never open (the owner's, the venue's with its QR code, the guide and the policy) load only when asked for.
const Owner = lazy(() => import("./pages/Owner").then((m) => ({ default: m.Owner })));
const VenuePage = lazy(() => import("./pages/Venue").then((m) => ({ default: m.VenuePage })));
const Help = lazy(() => import("./pages/Help").then((m) => ({ default: m.Help })));
const Privacy = lazy(() => import("./pages/Privacy").then((m) => ({ default: m.Privacy })));

function page() {
  const path = location.pathname;
  if (/^\/(new|check)\/?$/.test(path)) {
    // A sheet is always made on a venue: from its page ("Add a sheet from a photo") or from a posted sheet ("Add the photo").
    const q = new URLSearchParams(location.search);
    return q.get("venue") || q.get("sheet") ? <NewSheet /> : <NoVenue />;
  }
  if (/^\/join\/?$/.test(path)) return <Join />;
  if (/^\/owner\/?$/.test(path)) return <Owner />;
  if (/^\/help\/?$/.test(path)) return <Help />;
  if (/^\/privacy\/?$/.test(path)) return <Privacy />;
  const venue = /^\/v\/([^/]+)\/?$/.exec(path);
  if (venue) return <VenuePage id={decodeURIComponent(venue[1]!)} />;
  const sheet = /^\/s\/([^/]+)\/?$/.exec(path);
  if (sheet) return <SheetPage id={decodeURIComponent(sheet[1]!)} />;
  return <Home />;
}

export function App() {
  return (
    <Suspense
      fallback={
        <main>
          <p className="msg" role="status">
            Loading…
          </p>
        </main>
      }
    >
      {page()}
    </Suspense>
  );
}
