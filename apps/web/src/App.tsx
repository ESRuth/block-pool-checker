import { Suspense, lazy, useEffect } from "react";
import { AppBar } from "./components/AppBar";
import { AuthProvider, useAuth } from "./lib/auth";
import { navigate, useLocation } from "./lib/router";
import { Home } from "./pages/Home";
import { Join } from "./pages/Join";
import { NewSheet } from "./pages/NewSheet";
import { NoVenue } from "./pages/NoVenue";
import { SignIn } from "./pages/SignIn";
import { SheetPage } from "./pages/sheet/SheetPage";

// Pages most people never open (the owner's, the venue's with its QR code, the guide and the policy) load only when asked for.
const People = lazy(() => import("./pages/owner/People").then((m) => ({ default: m.People })));
const AllSheets = lazy(() => import("./pages/owner/AllSheets").then((m) => ({ default: m.AllSheets })));
const VenuePage = lazy(() => import("./pages/Venue").then((m) => ({ default: m.VenuePage })));
const Help = lazy(() => import("./pages/Help").then((m) => ({ default: m.Help })));
const Privacy = lazy(() => import("./pages/Privacy").then((m) => ({ default: m.Privacy })));

/** Go somewhere else without leaving a step in the history. */
function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

/** A page only the owner may open: asks for a code when signed out, and says so when signed in as someone else. */
function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { status, me } = useAuth();
  if (status === "checking") return <p className="msg">Loading…</p>;
  if (status === "signedOut") return <SignIn />;
  if (status === "signedIn" && !me?.owner)
    return (
      <main>
        <p className="msg">This page is for the owner. You are signed in as {me?.name}.</p>
        <a className="bigbtn" href="/signin">
          Use the owner code
        </a>
      </main>
    );
  return <>{children}</>;
}

function Screen() {
  const { path, search } = useLocation();
  if (/^\/(new|check)\/?$/.test(path)) {
    // A sheet is always made on a venue: from its page ("Add a sheet from a photo") or from a posted sheet ("Add the photo").
    const q = new URLSearchParams(search);
    return q.get("venue") || q.get("sheet") ? <NewSheet key={search} /> : <NoVenue />;
  }
  if (/^\/join\/?$/.test(path)) return <Join />;
  if (/^\/signin\/?$/.test(path)) return <SignIn />;
  if (/^\/owner\/?$/.test(path)) return <Redirect to="/" />; // the owner's page is now the Venues, Sheets and People tabs
  if (/^\/people\/?$/.test(path))
    return (
      <OwnerOnly>
        <People />
      </OwnerOnly>
    );
  if (/^\/sheets\/?$/.test(path))
    return (
      <OwnerOnly>
        <AllSheets />
      </OwnerOnly>
    );
  if (/^\/help\/?$/.test(path)) return <Help />;
  if (/^\/privacy\/?$/.test(path)) return <Privacy />;
  const venue = /^\/v\/([^/]+)\/?$/.exec(path);
  if (venue) return <VenuePage key={venue[1]} id={decodeURIComponent(venue[1]!)} />;
  const sheet = /^\/s\/([^/]+)\/?$/.exec(path);
  if (sheet) return <SheetPage key={sheet[1]} id={decodeURIComponent(sheet[1]!)} />;
  return <Home />;
}

export function App() {
  return (
    <AuthProvider>
      <AppBar />
      <Suspense
        fallback={
          <main>
            <p className="msg" role="status">
              Loading…
            </p>
          </main>
        }
      >
        <Screen />
      </Suspense>
    </AuthProvider>
  );
}
