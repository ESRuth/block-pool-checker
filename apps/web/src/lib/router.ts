import { useSyncExternalStore } from "react";

/**
 * Navigation without reloading the page. Links to this app's own pages swap the screen in place, so what the app knows (who is signed in,
 * where you were) survives a click, and back and forward work. No library: the app has one list of addresses (App.tsx) and this.
 */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  history[opts.replace ? "replaceState" : "pushState"](null, "", to);
  notify();
  const hash = new URL(to, location.origin).hash.slice(1);
  if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView());
  else window.scrollTo(0, 0);
}

function subscribe(f: () => void) {
  listeners.add(f);
  window.addEventListener("popstate", f);
  return () => {
    listeners.delete(f);
    window.removeEventListener("popstate", f);
  };
}

/** The current address, as the path and the query string (`?venue=...`). Re-renders when it changes. */
export function useLocation(): { path: string; search: string } {
  const s = useSyncExternalStore(subscribe, () => location.pathname + location.search);
  const i = s.indexOf("?");
  return i < 0 ? { path: s, search: "" } : { path: s.slice(0, i), search: s.slice(i) };
}

/** True for an ordinary left click on a link to another page of this app, which the browser should not handle itself. */
export function isInternalClick(e: MouseEvent, a: HTMLAnchorElement | null): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (!a || a.target || a.hasAttribute("download")) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return false;
  // A link to a spot on the same page (the Help contents) is left to the browser.
  return !(url.hash && url.pathname === location.pathname && url.search === location.search);
}

/** Make every link to this app's own pages navigate in place. Call once at start-up. */
export function installLinkHandler() {
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!isInternalClick(e, a)) return;
    e.preventDefault();
    navigate(a!.pathname + a!.search + a!.hash);
  });
}
