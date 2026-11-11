import { useState } from "react";
import { newEditToken, type SheetSettings as Settings } from "../../lib/sheetApi";
import { SheetSettings } from "./SheetSettings";

interface Props {
  id: string;
  /** The edit token in this page's address, if the page was opened from an edit link. */
  token: string;
  canEdit: boolean;
  title: string;
  meta: { title?: string; expiresAt: string; settings?: Settings };
  onMeta: (m: { title?: string; settings?: Settings; expiresAt?: string }) => void;
}

/** Copy the view link, and (for editors) the edit link. A maker who opened the sheet through their key can mint an edit link. */
export function ShareTab({ id, token, canEdit, title, meta, onMeta }: Props) {
  const [copied, setCopied] = useState("");
  const [editLink, setEditLink] = useState("");

  async function copy(which: string, text: string) {
    try {
      if (which === "view" && navigator.share) await navigator.share({ url: text, title });
      else await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      /* canblocked */
    }
  }

  return (
    <div className="share">
      <h2>Share</h2>
      <p className="sub">
        {meta.settings?.venueId ? "People open this sheet with the venue's QR code and PIN." : "Anyone with the view link can watch this sheet."}
        {canEdit ? " Send the edit link only to someone who should be able to change it." : ""}{" "}
        {meta.expiresAt ? `This sheet is removed on ${new Date(meta.expiresAt).toLocaleDateString()}.` : ""}
      </p>
      <div className="actions">
        <button onClick={() => copy("view", `${location.origin}/s/${id}`)}>{copied === "view" ? "Copied" : "Copy view link"}</button>
        {canEdit && token && <button onClick={() => copy("edit", location.href)}>{copied === "edit" ? "Copied" : "Copy edit link"}</button>}
        {canEdit && !token && !editLink && (
          <button
            onClick={() =>
              newEditToken(id)
                .then((t) => setEditLink(`${location.origin}/s/${id}#k=${t}`))
                .catch(() => alert("Could not make an edit link. Try again."))
            }
          >
            Make an edit link
          </button>
        )}
      </div>
      {editLink && (
        <div>
          <p className="sub">Whoever has this link can change or delete this sheet.</p>
          <input readOnly value={editLink} onFocus={(e) => e.currentTarget.select()} aria-label="Edit link" />
          <div className="actions">
            <button onClick={() => copy("edit", editLink)}>{copied === "edit" ? "Copied" : "Copy edit link"}</button>
          </div>
        </div>
      )}
      {canEdit && <SheetSettings id={id} token={token} title={meta.title ?? ""} settings={meta.settings} onChanged={onMeta} />}
    </div>
  );
}
