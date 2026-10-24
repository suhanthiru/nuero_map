import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ArrowUpDown, ChevronDown, ChevronRight, ChevronsDownUp, FilePen, FileUp, FolderPlus, LocateFixed } from "lucide-react";
import type { FolderId, VaultNoteSummary, VaultTree } from "../../api/contract";
import { Button } from "../../shared/ui/Button";
import { menuTrigger, openMenuAt } from "../workspace/menu/menus";
import { useMenu } from "../workspace/menu/menuStore";
import { focusedView } from "../workspace/model/panes";
import { notify } from "../workspace/notices";
import { useOpen } from "../workspace/useOpen";
import { useWorkspace } from "../workspace/workspaceStore";
import { moveItem, newFolder, newNote, renameItem, revealFolder } from "./actions";
import { buildTree, canMoveFolder, canMoveNote, NOTE_SORT_LABEL, NOTE_SORTS, type FolderNode, type MoveCheck } from "./model/tree";
import { NameField } from "./NameField";
import { useVault } from "./queries";
import { folderMenu, noteMenu, rootMenu } from "./vaultMenus";
import { sameItem, useVaultUi, type VaultItem } from "./vaultStore";
import w from "../workspace/Workspace.module.css";
import s from "./Vault.module.css";

/** Hovering a closed folder this long while dragging opens it. */
const SPRING_OPEN_MS = 600;
const ROOT = "";

/** The file type of an imported note, shown like a notes app shows non-markdown files. */
function sourceExt(note: VaultNoteSummary): string | null {
  const ext = note.source?.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  return ext && ext !== "md" && ext !== "markdown" ? ext : null;
}

/** F2 renames, Delete asks to delete; Shift+F10 or the Menu key opens the row's menu. */
function rowKeys(item: VaultItem, menuKeys: (e: KeyboardEvent<HTMLElement>) => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    menuKeys(e);
    if (e.defaultPrevented) return;
    if (e.key === "F2") useVaultUi.getState().setRenaming(item);
    else if (e.key === "Delete") useVaultUi.getState().setDeleting(item);
    else return;
    e.preventDefault();
  };
}

interface DragState {
  readonly item: VaultItem;
  /** The folder the drop would go into ("" = top level), when the drop is allowed. */
  readonly over: string | null;
}

function checkMove(item: VaultItem, target: FolderId | null, tree: VaultTree): MoveCheck {
  if (item.kind === "folder") {
    const folder = tree.folders.find((f) => f.id === item.id);
    return folder ? canMoveFolder(folder, target, tree) : { ok: false, reason: "" };
  }
  const note = tree.notes.find((n) => n.id === item.id);
  return note ? canMoveNote(note, target, tree) : { ok: false, reason: "" };
}

interface RowProps {
  readonly drag: DragState | null;
  readonly activeNoteId: string | null;
  readonly onDragStart: (e: DragEvent, item: VaultItem) => void;
}

function NoteRow({ note, activeNoteId, onDragStart }: { readonly note: VaultNoteSummary } & RowProps) {
  const { open } = useOpen();
  const item: VaultItem = { kind: "note", id: note.id };
  const renaming = useVaultUi((st) => sameItem(st.renaming, item));
  const setRenaming = useVaultUi((st) => st.setRenaming);
  const active = note.id === activeNoteId;
  const menu = menuTrigger(`Note: ${note.title}`, () => noteMenu(note));
  const ext = sourceExt(note);
  const view = { kind: "note", noteId: note.id } as const;
  if (renaming) {
    return (
      <li className={s.row} data-drop-folder={note.folderId ?? ROOT}>
        <NameField initial={note.title} label={`Rename note ${note.title}`} onCommit={(name) => renameItem(item, name)} onCancel={() => setRenaming(null)} />
      </li>
    );
  }
  return (
    <li className={s.row} data-drop-folder={note.folderId ?? ROOT}>
      <button
        type="button"
        data-note-row={note.id}
        className={active ? `${w.treeItem} ${w.treeItemActive}` : w.treeItem}
        aria-current={active ? "page" : undefined}
        title={note.source ? `${note.title} (imported from ${note.source})` : note.title}
        draggable
        onDragStart={(e) => onDragStart(e, item)}
        onClick={(e) => open(view, e)}
        onAuxClick={(e) => open(view, e)}
        onContextMenu={menu.onContextMenu}
        onKeyDown={rowKeys(item, menu.onKeyDown)}
      >
        <span className={w.treeTitle}>{note.title}</span>
        {ext && <span className={s.ext}>{ext}</span>}
      </button>
    </li>
  );
}

function FolderRow({ node, ...rest }: { readonly node: FolderNode } & RowProps) {
  const { folder } = node;
  const item: VaultItem = { kind: "folder", id: folder.id };
  const open = useVaultUi((st) => st.expanded.includes(folder.id));
  const toggle = useVaultUi((st) => st.toggleFolder);
  const renaming = useVaultUi((st) => sameItem(st.renaming, item));
  const setRenaming = useVaultUi((st) => st.setRenaming);
  const menu = menuTrigger(`Folder: ${folder.name}`, () => folderMenu(folder));
  const target = rest.drag?.over === folder.id;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li className={target ? `${s.row} ${s.dropTarget}` : s.row} data-drop-folder={folder.id}>
      {renaming ? (
        <span className={s.renameRow}>
          <Chevron size={14} aria-hidden className={s.chevron} />
          <NameField initial={folder.name} label={`Rename folder ${folder.name}`} onCommit={(name) => renameItem(item, name)} onCancel={() => setRenaming(null)} />
        </span>
      ) : (
        <button
          type="button"
          data-folder-row={folder.id}
          className={w.folder}
          aria-expanded={open}
          draggable
          onDragStart={(e) => rest.onDragStart(e, item)}
          onClick={() => toggle(folder.id)}
          onContextMenu={menu.onContextMenu}
          onKeyDown={(e) => {
            // → opens a closed folder and ← closes an open one, as in a tree.
            if ((e.key === "ArrowRight" && !open) || (e.key === "ArrowLeft" && open)) {
              e.preventDefault();
              toggle(folder.id);
              return;
            }
            rowKeys(item, menu.onKeyDown)(e);
          }}
        >
          <Chevron size={14} aria-hidden className={s.chevron} />
          <span className={w.treeTitle}>{folder.name}</span>
          <span className={w.folderCount}>{node.noteCount}</span>
        </button>
      )}
      {open && (node.folders.length > 0 || node.notes.length > 0) && <Items folders={node.folders} notes={node.notes} {...rest} />}
    </li>
  );
}

function Items({ folders, notes, ...rest }: { readonly folders: readonly FolderNode[]; readonly notes: readonly VaultNoteSummary[] } & RowProps) {
  return (
    <ul className={w.treeItems}>
      {folders.map((f) => (
        <FolderRow key={f.folder.id} node={f} {...rest} />
      ))}
      {notes.map((n) => (
        <NoteRow key={n.id} note={n} {...rest} />
      ))}
    </ul>
  );
}

/** Scrolls to and focuses the active note's row when "reveal" is asked for. */
function useReveal(activeNoteId: string | null, tree: VaultTree | undefined) {
  const pending = useVaultUi((st) => st.revealPending);
  const revealDone = useVaultUi((st) => st.revealDone);
  useEffect(() => {
    if (!pending || !tree) return;
    revealDone();
    const note = tree.notes.find((n) => n.id === activeNoteId);
    if (!note) return;
    revealFolder(note.folderId);
    requestAnimationFrame(() => {
      const row = [...document.querySelectorAll<HTMLElement>("[data-note-row]")].find((el) => el.dataset.noteRow === note.id);
      row?.scrollIntoView({ block: "nearest" });
      row?.focus();
    });
  }, [pending, activeNoteId, tree, revealDone]);
}

/**
 * Dragging a row onto a folder moves it there; onto a note, into that note's folder; onto
 * the empty space below, to the top level. A closed folder opens if you hover it a moment.
 * From the keyboard, the row's menu has "Move to…".
 */
function useDragMove(tree: VaultTree | undefined) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const spring = useRef<{ folder: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const clearSpring = () => {
    if (spring.current) clearTimeout(spring.current.timer);
    spring.current = null;
  };

  const targetOf = (e: DragEvent): string | null => {
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-drop-folder]") : null;
    return el ? (el.dataset.dropFolder ?? ROOT) : ROOT;
  };

  const onDragStart = (e: DragEvent, item: VaultItem) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.id);
    setDrag({ item, over: null });
  };

  const onDragOver = (e: DragEvent) => {
    if (!drag || !tree) return;
    const over = targetOf(e);
    const allowed = checkMove(drag.item, over || null, tree).ok;
    if (allowed) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
    const shown = allowed ? over : null;
    if (shown !== drag.over) setDrag({ ...drag, over: shown });
    if (over && spring.current?.folder !== over) {
      clearSpring();
      spring.current = { folder: over, timer: setTimeout(() => useVaultUi.getState().expand([over]), SPRING_OPEN_MS) };
    }
  };

  const onDrop = (e: DragEvent) => {
    clearSpring();
    if (!drag || !tree) return;
    e.preventDefault();
    const target = targetOf(e) || null;
    const check = checkMove(drag.item, target, tree);
    setDrag(null);
    if (check.ok) void moveItem(drag.item, target);
    else if (check.reason) notify(check.reason);
  };

  const onDragEnd = () => {
    clearSpring();
    setDrag(null);
  };

  return { drag, onDragStart, onDragOver, onDrop, onDragEnd };
}

/** The Notes pane: your own notes in folders, like a notes app's file explorer. */
export function NotesExplorer() {
  const vault = useVault();
  const { sort, setSort, collapseAll, requestReveal, setImportInto } = useVaultUi();
  const expanded = useVaultUi((st) => st.expanded);
  const layout = useWorkspace((st) => st.layout);
  const view = focusedView(layout);
  const activeNoteId = view.kind === "note" ? view.noteId : null;
  const sortButton = useRef<HTMLButtonElement>(null);
  const sortOpen = useMenu((st) => !!st.menu && st.menu.trigger === sortButton.current);
  const move = useDragMove(vault.data);
  useReveal(activeNoteId, vault.data);

  const built = vault.data ? buildTree(vault.data, sort) : null;
  const empty = vault.data && vault.data.folders.length === 0 && vault.data.notes.length === 0;
  const root = menuTrigger("Notes", rootMenu);

  return (
    <div className={w.pane}>
      <div className={w.navButtons} role="toolbar" aria-label="Notes explorer">
        <button type="button" className={w.iconButton} aria-label="New note (Ctrl+N)" title="New note (Ctrl+N)" onClick={() => void newNote()}>
          <FilePen size={15} aria-hidden />
        </button>
        <button type="button" className={w.iconButton} aria-label="New folder" title="New folder" onClick={() => void newFolder()}>
          <FolderPlus size={15} aria-hidden />
        </button>
        <button
          type="button"
          className={w.iconButton}
          aria-label="Import Word, Google Docs or Markdown files"
          title="Import documents"
          onClick={() => setImportInto({ folderId: null })}
        >
          <FileUp size={15} aria-hidden />
        </button>
        <button
          ref={sortButton}
          type="button"
          className={w.iconButton}
          aria-label={`Change sort order (${NOTE_SORT_LABEL[sort]})`}
          title="Change sort order"
          aria-haspopup="menu"
          aria-expanded={sortOpen}
          onClick={(e) => {
            if (sortOpen) useMenu.getState().closeMenu(false);
            else
              openMenuAt(
                e.currentTarget,
                "Sort order",
                NOTE_SORTS.map((key) => ({ id: key, label: NOTE_SORT_LABEL[key], checked: key === sort, run: () => setSort(key) })),
                { toggles: true },
              );
          }}
        >
          <ArrowUpDown size={15} aria-hidden />
        </button>
        <button type="button" className={w.iconButton} aria-label="Collapse all" title="Collapse all" disabled={expanded.length === 0} onClick={collapseAll}>
          <ChevronsDownUp size={15} aria-hidden />
        </button>
        <button
          type="button"
          className={w.iconButton}
          aria-label="Reveal active note"
          title="Reveal active note"
          disabled={!activeNoteId}
          onClick={requestReveal}
        >
          <LocateFixed size={15} aria-hidden />
        </button>
      </div>
      {vault.isPending && <p className={w.paneEmpty}>Loading…</p>}
      {vault.isError && <p className={w.paneEmpty}>Couldn't load your notes.</p>}
      {empty && (
        <div className={s.emptyPane}>
          <p className={w.paneEmpty}>Write your own notes here and file them in folders, or bring in Word and Google Docs.</p>
          <Button size="sm" onClick={() => void newNote(null)}>
            New note
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setImportInto({ folderId: null })}>
            Import documents
          </Button>
        </div>
      )}
      {built && (
        <div
          className={move.drag?.over === ROOT ? `${s.treeArea} ${s.dropRoot}` : s.treeArea}
          data-drop-folder={ROOT}
          onDragOver={move.onDragOver}
          onDrop={move.onDrop}
          onDragEnd={move.onDragEnd}
          onContextMenu={root.onContextMenu}
        >
          <ul className={w.tree} aria-label="Notes and folders">
            {built.folders.map((f) => (
              <FolderRow key={f.folder.id} node={f} drag={move.drag} activeNoteId={activeNoteId} onDragStart={move.onDragStart} />
            ))}
            {built.notes.map((n) => (
              <NoteRow key={n.id} note={n} drag={move.drag} activeNoteId={activeNoteId} onDragStart={move.onDragStart} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
