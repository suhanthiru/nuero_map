import { useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Folder, X } from "lucide-react";
import { NOTE_MAX_CHARS, type FolderId, type ImportedDocuments, type SkipReason, type VaultTree } from "../../api/contract";
import { userMessageOf } from "../../api/errors";
import { isTauri } from "../../api/transport";
import { Button } from "../../shared/ui/Button";
import { Modal } from "../workspace/Modal";
import { useWorkspace } from "../workspace/workspaceStore";
import { deleteItem, importDocuments, moveItem } from "./actions";
import { canMoveFolder, canMoveNote, folderAndBelow, folderPath, notesUnder } from "./model/tree";
import { useVault } from "./queries";
import { useVaultUi, type VaultItem } from "./vaultStore";
import w from "../workspace/Workspace.module.css";
import s from "./Vault.module.css";

const TOP_LEVEL = "Notes (top level)";

interface Destination {
  readonly id: FolderId | null;
  readonly label: string;
}

/** The top level, then every folder by its path. */
function destinations(tree: VaultTree): Destination[] {
  const folders = tree.folders
    .map((f) => ({ id: f.id, label: folderPath(f.id, tree.folders).join(" / ") }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
  return [{ id: null, label: TOP_LEVEL }, ...folders];
}

function itemName(item: VaultItem, tree: VaultTree): string {
  return item.kind === "folder" ? (tree.folders.find((f) => f.id === item.id)?.name ?? "folder") : (tree.notes.find((n) => n.id === item.id)?.title ?? "note");
}

function DialogHead({ title, onClose }: { readonly title: string; readonly onClose: () => void }) {
  return (
    <div className={w.dialogHead}>
      <h2 className={w.dialogTitle}>{title}</h2>
      <button type="button" className={w.iconButton} aria-label="Close" onClick={onClose}>
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

/** "Move to…": type to filter folders, Enter moves. The keyboard way to do what dragging does. */
function MoveDialog({ item, tree }: { readonly item: VaultItem; readonly tree: VaultTree }) {
  const close = () => useVaultUi.getState().setMoving(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const name = itemName(item, tree);

  const options = useMemo(() => {
    const check = (id: FolderId | null) => {
      if (item.kind === "folder") {
        const folder = tree.folders.find((f) => f.id === item.id);
        return folder ? canMoveFolder(folder, id, tree).ok : false;
      }
      const note = tree.notes.find((n) => n.id === item.id);
      return note ? canMoveNote(note, id, tree).ok : false;
    };
    const q = query.trim().toLowerCase();
    return destinations(tree).filter((d) => check(d.id) && (!q || d.label.toLowerCase().includes(q)));
  }, [item, tree, query]);

  const choose = async (d: Destination) => {
    close();
    await moveItem(item, d.id);
  };

  return (
    <Modal label={`Move ${name} to a folder`} onClose={close}>
      <input
        className={w.switcherInput}
        placeholder={`Move “${name}” to…`}
        aria-label={`Move ${name} to which folder`}
        aria-controls="move-results"
        aria-activedescendant={options[active] ? `mv-${active}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((i) => Math.min(options.length - 1, i + 1));
          else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
          else if (e.key === "Enter" && options[active]) void choose(options[active]);
          else return;
          e.preventDefault();
        }}
      />
      <ul id="move-results" role="listbox" aria-label="Folders" className={w.switcherList}>
        {options.map((d, i) => (
          <li
            key={d.id ?? "top"}
            id={`mv-${i}`}
            role="option"
            aria-selected={i === active}
            className={w.switcherItem}
            onMouseEnter={() => setActive(i)}
            onClick={() => void choose(d)}
          >
            <Folder size={14} aria-hidden />
            <span className={w.switcherTitle}>{d.label}</span>
          </li>
        ))}
        {options.length === 0 && <li className={w.paneEmpty}>No folder it can move to matches.</li>}
      </ul>
      <p className={w.switcherHint}>
        <kbd>↑↓</kbd> navigate · <kbd>Enter</kbd> move · <kbd>Esc</kbd> cancel · or drag it in the explorer
      </p>
    </Modal>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function DeleteDialog({ item, tree }: { readonly item: VaultItem; readonly tree: VaultTree }) {
  const close = () => useVaultUi.getState().setDeleting(null);
  const [busy, setBusy] = useState(false);
  const name = itemName(item, tree);
  const inside =
    item.kind === "folder"
      ? { notes: notesUnder(item.id, tree).length, folders: folderAndBelow(item.id, tree.folders).size - 1 }
      : null;
  const contents = inside && (inside.notes || inside.folders) ? [inside.notes && plural(inside.notes, "note"), inside.folders && plural(inside.folders, "folder")].filter(Boolean).join(" and ") : null;

  return (
    <Modal label={`Delete ${name}`} onClose={close} className={`${w.switcher} ${s.confirm}`}>
      <DialogHead title={item.kind === "folder" ? "Delete folder" : "Delete note"} onClose={close} />
      <div className={s.dialogBody}>
        <p>
          Delete <strong>“{name}”</strong>
          {contents ? ` and the ${contents} inside it` : ""}? This can't be undone.
        </p>
        <div className={s.dialogActions}>
          <Button onClick={close} autoFocus>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await deleteItem(item);
              setBusy(false);
              if (ok) close();
            }}
          >
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export const SKIP_REASON_TEXT: Readonly<Record<SkipReason, string>> = {
  unsupported: "not a document this can read",
  legacy_word: "an old Word .doc file: open it in Word and save it as .docx",
  google_shortcut: "a Google Drive shortcut with no text in it: in Google Docs, use File → Download → Microsoft Word (.docx)",
  too_long: `longer than a note can be (${NOTE_MAX_CHARS.toLocaleString("en")} characters)`,
  too_large: "too large to read",
  duplicate: "already imported here",
  unreadable: "couldn't be read (damaged, or open in another app)",
};

const DOCUMENT_EXTENSIONS = ["docx", "md", "markdown", "txt", "zip"];

async function pick(directory: boolean): Promise<string[]> {
  const picked = await openDialog({
    multiple: !directory,
    directory,
    title: directory ? "Import a folder of documents" : "Import documents",
    filters: directory ? undefined : [{ name: "Documents", extensions: DOCUMENT_EXTENSIONS }],
  });
  if (!picked) return [];
  return Array.isArray(picked) ? picked : [picked];
}

function ImportResult({ result, folderLabel, onDone }: { readonly result: ImportedDocuments; readonly folderLabel: string; readonly onDone: () => void }) {
  const open = useWorkspace((st) => st.open);
  const first = result.notes[0];
  return (
    <div className={s.dialogBody} role="status">
      <p>
        {result.notes.length > 0 ? (
          <>
            Imported <strong>{plural(result.notes.length, "note")}</strong> into {folderLabel}
            {result.folders.length > 0 && <> ({plural(result.folders.length, "new folder")})</>}.
          </>
        ) : (
          "Nothing was imported."
        )}
      </p>
      {result.skipped.length > 0 && (
        <>
          <p className={s.muted}>{plural(result.skipped.length, "file")} skipped:</p>
          <ul className={s.skipList}>
            {result.skipped.map((k) => (
              <li key={k.path}>
                <code>{k.path.split(/[\\/]/).pop()}</code>: {SKIP_REASON_TEXT[k.reason]}
              </li>
            ))}
          </ul>
        </>
      )}
      {result.ignored > 0 && <p className={s.muted}>{plural(result.ignored, "other file")} (images, PDFs and so on) were left out.</p>}
      <div className={s.dialogActions}>
        {first && (
          <Button
            onClick={() => {
              open({ kind: "note", noteId: first.id });
              onDone();
            }}
          >
            Open “{first.title}”
          </Button>
        )}
        <Button variant="primary" onClick={onDone} autoFocus>
          Done
        </Button>
      </div>
    </div>
  );
}

/** Bring in Word, Google Docs (downloaded as .docx), Markdown and text files, or whole folders and zips. */
function ImportDialog({ folderId, tree }: { readonly folderId: FolderId | null; readonly tree: VaultTree }) {
  const close = () => useVaultUi.getState().setImportInto(null);
  const [target, setTarget] = useState<FolderId | null>(folderId);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportedDocuments | null>(null);
  const options = destinations(tree);
  const folderLabel = options.find((d) => d.id === target)?.label ?? TOP_LEVEL;

  const run = async (paths: readonly string[]) => {
    if (paths.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await importDocuments(paths, target));
    } catch (err) {
      setError(userMessageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label="Import documents" onClose={close} className={`${w.switcher} ${s.importDialog}`}>
      <DialogHead title="Import documents" onClose={close} />
      {result ? (
        <ImportResult result={result} folderLabel={folderLabel === TOP_LEVEL ? "your notes" : `“${folderLabel}”`} onDone={close} />
      ) : (
        <div className={s.dialogBody}>
          <p>
            Word documents (.docx), Markdown and text files become notes you can edit, link and file into folders. Pick a whole folder or a .zip and
            its subfolders become folders too.
          </p>
          <p className={s.muted}>
            From Google Docs: <strong>File → Download → Microsoft Word (.docx)</strong>. For many docs at once, download a Google Drive folder (it
            arrives as a .zip, already converted to Word) and import the zip.
          </p>
          <label className={s.field}>
            <span>Import into</span>
            <select value={target ?? ""} onChange={(e) => setTarget(e.target.value || null)} disabled={busy}>
              {options.map((d) => (
                <option key={d.id ?? "top"} value={d.id ?? ""}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          {isTauri() ? (
            <div className={s.dialogActions}>
              <Button disabled={busy} onClick={() => pick(true).then(run, (e) => setError(String(e)))}>
                Choose a folder…
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => pick(false).then(run, (e) => setError(String(e)))}>
                {busy ? "Importing…" : "Choose files…"}
              </Button>
            </div>
          ) : (
            <form
              className={s.pathForm}
              onSubmit={(e) => {
                e.preventDefault();
                void run(typed.split(/[\n;]/).map((p) => p.trim()).filter(Boolean));
              }}
            >
              <label className={s.field}>
                <span>Paths (one per line)</span>
                <textarea
                  rows={3}
                  value={typed}
                  placeholder={"C:\\Users\\you\\Documents\\Plan.docx\nC:\\Users\\you\\Downloads\\Drive folder.zip"}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={busy}
                />
              </label>
              <div className={s.dialogActions}>
                <Button type="submit" variant="primary" disabled={busy || !typed.trim()}>
                  {busy ? "Importing…" : "Import"}
                </Button>
              </div>
            </form>
          )}
          {error && (
            <p className={s.errorText} role="alert">
              Couldn't import: {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Hosts the vault's dialogs (one at a time). */
export function VaultDialogs() {
  const { moving, deleting, importInto } = useVaultUi();
  const vault = useVault();
  const tree = vault.data;
  if (!tree) return null;
  if (moving) return <MoveDialog item={moving} tree={tree} />;
  if (deleting) return <DeleteDialog item={deleting} tree={tree} />;
  if (importInto) return <ImportDialog folderId={importInto.folderId} tree={tree} />;
  return null;
}
