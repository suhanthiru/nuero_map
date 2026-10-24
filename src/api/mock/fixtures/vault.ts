import type { VaultFolder, VaultNote } from "../../contract";
import { daysAgo } from "../rng";

const folder = (id: string, name: string, parentId: string | null, ageDays: number): VaultFolder => ({
  id,
  parentId,
  name,
  createdAt: daysAgo(ageDays),
});

export const MOCK_FOLDERS: readonly VaultFolder[] = [
  folder("f-projects", "Projects", null, 30),
  folder("f-neural", "Neural Map", "f-projects", 28),
  folder("f-reading", "Reading", null, 25),
  folder("f-imported", "Imported docs", null, 4),
];

const note = (
  id: string,
  title: string,
  folderId: string | null,
  body: string,
  ageDays: number,
  editedDays: number,
  source: string | null = null,
): VaultNote => ({ id, title, folderId, body, createdAt: daysAgo(ageDays), updatedAt: daysAgo(editedDays), source });

export const MOCK_VAULT_NOTES: readonly VaultNote[] = [
  note("n-inbox", "Inbox", null, "Loose thoughts before they find a folder.\n\n- [ ] Sort the reading list\n- [ ] Try [[Decay scoring for ideas]] with a 10-day half-life\n", 30, 0),
  note(
    "n-launch",
    "Launch checklist",
    "f-neural",
    "## Before 1.0\n\n- [x] Graph view\n- [ ] Installer\n- [ ] Import Word and Google Docs\n\nSee [[Weekly plan]] for this week.\n",
    20,
    1,
  ),
  note("n-weekly", "Weekly plan", "f-projects", "## This week\n\n1. Finish the notes explorer\n2. Read a chapter of [[Thinking in Systems notes]]\n", 12, 2),
  note("n-smart-notes", "How to Take Smart Notes", "f-reading", "Write notes in your own words, then link them.\n\n> [!quote] Writing is the medium of thinking.\n", 25, 9),
  note(
    "n-q3",
    "Q3 planning doc",
    "f-imported",
    "# Q3 planning\n\n## Goals\n\n- Ship the desktop app\n- **Interview** five users\n\n| Week | Focus |\n| --- | --- |\n| 1 | Import |\n| 2 | Polish |\n",
    4,
    4,
    "Q3 planning doc.docx",
  ),
];
