import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { accessKey, clearAccessKey, setAccessKey, whoAmI, type Me } from "./access";

/**
 * Who is using the app, in one place. "signedOut" is a key the server refused or no key at all (a viewer with only a PIN is signed out here;
 * their pass is a cookie the page cannot see). "offline" means the server could not be reached: the saved key is kept and nothing looks signed out.
 * The only thing stored in the browser is the key itself (see access.ts).
 */
export type AuthStatus = "checking" | "signedIn" | "signedOut" | "offline";
interface Auth {
  status: AuthStatus;
  me: Me | null;
  /** Ask the server again who this key belongs to. */
  refresh: () => Promise<void>;
  /** Check a code first, and only keep it if the server accepts it, so a mistyped code never replaces the key already saved. */
  signIn: (code: string) => Promise<"ok" | "refused" | "offline">;
  signOut: () => void;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [me, setMe] = useState<Me | null>(null);

  const refresh = useCallback(async () => {
    if (!accessKey()) {
      setMe(null);
      return setStatus("signedOut");
    }
    try {
      const m = await whoAmI();
      setMe(m);
      setStatus(m ? "signedIn" : "signedOut");
    } catch {
      setStatus("offline"); // keep the key and whatever we knew
    }
  }, []);

  useEffect(() => {
    // A personal link, or a home-screen icon made from one, carries the key in the #fragment: keep it. (The join page leaves the address as it is.)
    const k = new URLSearchParams(location.hash.replace(/^#/, "")).get("c");
    if (k) {
      setAccessKey(k);
      if (location.pathname !== "/join") history.replaceState(null, "", location.pathname + location.search);
    }
    void refresh();
  }, [refresh]);

  const value = useMemo<Auth>(
    () => ({
      status,
      me,
      refresh,
      signIn: async (code) => {
        const m = await whoAmI(code.trim()).catch(() => undefined);
        if (m === undefined) return "offline";
        if (!m) return "refused";
        setAccessKey(code.trim());
        setMe(m);
        setStatus("signedIn");
        return "ok";
      },
      signOut: () => {
        clearAccessKey();
        setMe(null);
        setStatus("signedOut");
      },
    }),
    [status, me, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth needs an AuthProvider");
  return v;
}
