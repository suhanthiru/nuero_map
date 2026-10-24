import { Columns2, FilePen, FileUp, FolderInput, FolderPlus, PencilLine, SquarePlus, Trash } from "lucide-react";
import type { FolderId, VaultFolder, VaultNoteSummary } from "../../api/contract";
import { bookmarkEntry, copyEntry, SEP } from "../workspace/menu/menus";
import { entries, type MenuEntry } from "../workspace/menu/menuStore";
import { useWorkspace } from "../workspace/workspaceStore";
import { newFolder, newNote } from "./actions";
import { useVaultUi } from "./vaultStore";

const ui = () => useVaultUi.getState();
const st = () => useWorkspace.getState();

function creating(folderId: FolderId | null): MenuEntry[] {
  return [
    { id: "new-note", label: "New note", icon: FilePen, run: () => void newNote(folderId) },
    { id: "new-folder", label: "New folder", icon: FolderPlus, run: () => void newFolder(folderId) },
    { id: "import", label: folderId ? "Import documents here…" : "Import documents…", icon: FileUp, run: () => ui().setImportInto({ folderId }) },
  ];
}

/** Right-click on the explorer's empty space. */
export function rootMenu(): MenuEntry[] {
  return creating(null);
}

export function folderMenu(folder: VaultFolder): MenuEntry[] {
  const item = { kind: "folder", id: folder.id } as const;
  return entries(
    ...creating(folder.id),
    SEP("s1"),
    { id: "rename", label: "Rename", icon: PencilLine, hint: "F2", run: () => ui().setRenaming(item) },
    { id: "move", label: "Move folder to…", icon: FolderInput, run: () => ui().setMoving(item) },
    copyEntry(folder.name, "Copy name"),
    SEP("s2"),
    { id: "delete", label: "Delete", icon: Trash, hint: "Del", danger: true, run: () => ui().setDeleting(item) },
  );
}

export function noteMenu(note: VaultNoteSummary): MenuEntry[] {
  const view = { kind: "note", noteId: note.id } as const;
  const item = { kind: "note", id: note.id } as const;
  return entries(
    { id: "new-tab", label: "Open in new tab", icon: SquarePlus, run: () => st().open(view, { newTab: true }) },
    { id: "to-right", label: "Open to the right", icon: Columns2, run: () => st().open(view, { toRight: true }) },
    SEP("s1"),
    { id: "rename", label: "Rename", icon: PencilLine, hint: "F2", run: () => ui().setRenaming(item) },
    { id: "move", label: "Move note to…", icon: FolderInput, run: () => ui().setMoving(item) },
    bookmarkEntry(view),
    copyEntry(note.title),
    SEP("s2"),
    { id: "delete", label: "Delete", icon: Trash, hint: "Del", danger: true, run: () => ui().setDeleting(item) },
  );
}
