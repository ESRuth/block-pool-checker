/** The personal key the owner gave this person. It lets them read photos and make sheets; it holds no sheet data. */
const KEY = "bpc.key";

export const accessKey = () => localStorage.getItem(KEY) ?? "";
export const setAccessKey = (k: string) => {
  localStorage.setItem(KEY, k);
  applyManifest();
};
export const clearAccessKey = () => {
  localStorage.removeItem(KEY);
  applyManifest();
};

/**
 * Point the page's manifest at one that carries the key, so adding the app to the home screen from any page
 * makes an icon that opens already signed in (iPhone home-screen apps do not share the browser's storage).
 */
export function applyManifest() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const k = accessKey();
  if (link) link.href = k ? `/manifest.webmanifest?c=${encodeURIComponent(k)}` : "/manifest.webmanifest";
}

export interface Me {
  name: string;
  owner: boolean;
}
/**
 * Who a key belongs to (this phone's by default). Null means the server refused the key. Failing to reach the server (or a server error)
 * throws instead, so a bad connection is never mistaken for "not signed in" and the saved key is left alone.
 */
export async function whoAmI(key: string = accessKey()): Promise<Me | null> {
  const res = await fetch("/api/me", { headers: key ? { "X-Invite-Code": key } : {} });
  if (res.ok) return (await res.json()) as Me;
  if (res.status >= 500) throw new Error("server error");
  return null;
}
