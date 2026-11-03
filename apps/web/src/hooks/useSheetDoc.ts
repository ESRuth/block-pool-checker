import { useEffect, useRef, useState } from "react";
import { loadSheet, saveSheet, SheetError, type Sheet } from "../lib/sheetApi";

export type Saving = "saved" | "saving" | "error";

/**
 * The saved sheet: loads it, and saves every edit a moment after it happens (only editors can save).
 * `sheet` is undefined while loading and null when the link opens nothing.
 */
export function useSheetDoc(id: string, token: string) {
  // The edit link carries the token; a person's own sheets also open editable through their personal key. The server says which.
  const [canEdit, setCanEdit] = useState(!!token);
  const [sheet, setSheet] = useState<Sheet | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [addedBy, setAddedBy] = useState("");
  const [saving, setSaving] = useState<Saving>("saved");
  const [rev, setRev] = useState(0); // bumps on every edit; 0 = nothing to save
  const latest = useRef<Sheet | null>(null); // the newest sheet, for callbacks that outlive a render
  latest.current = sheet ?? null;

  useEffect(() => {
    setLoadError("");
    loadSheet(id, token)
      .then((r) => {
        setSheet(r.doc);
        setAddedBy(r.createdBy ?? "");
        setCanEdit(r.canEdit || !!token);
      })
      .catch((e) => {
        if (e instanceof SheetError && e.status === 404) setSheet(null);
        else setLoadError("Could not reach the server. Check your connection and try again.");
      });
  }, [id, token]);

  useEffect(() => {
    if (!canEdit || rev === 0 || !sheet) return;
    setSaving("saving");
    const t = setTimeout(() => {
      saveSheet(id, token, sheet)
        .then(() => setSaving("saved"))
        .catch(() => setSaving("error"));
    }, 600);
    return () => clearTimeout(t);
    // Saves run only when an edit bumps `rev`, never because the sheet object changed (a load or a poll must not trigger a save).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  const edit = (f: (s: Sheet) => Sheet) => {
    setSheet((s) => (s ? f(s) : s));
    setRev((r) => r + 1);
  };
  const update = (patch: Partial<Sheet>) => edit((s) => ({ ...s, ...patch }));

  return { sheet, canEdit, addedBy, loadError, saving, edit, update, latest };
}
export type SheetEdit = ReturnType<typeof useSheetDoc>["edit"];
