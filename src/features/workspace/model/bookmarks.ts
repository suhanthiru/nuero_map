import { isWellFormedView, sameView, viewKey, type View } from "./tabs";

/** What gets saved: a graph bookmark is the whole map, not a focused topic or edge. */
export function bookmarkView(view: View): View {
  return view.kind === "graph" ? { kind: "graph" } : view;
}

export function bookmarkKey(view: View): string {
  return viewKey(bookmarkView(view));
}

export function isBookmarked(bookmarks: readonly View[], view: View): boolean {
  const target = bookmarkView(view);
  return bookmarks.some((b) => sameView(b, target));
}

/** Newest first. */
export function toggleBookmark(bookmarks: readonly View[], view: View): View[] {
  const target = bookmarkView(view);
  return isBookmarked(bookmarks, target) ? bookmarks.filter((b) => !sameView(b, target)) : [target, ...bookmarks];
}

export function removeBookmark(bookmarks: readonly View[], view: View): View[] {
  return bookmarks.filter((b) => !sameView(b, bookmarkView(view)));
}

/** Keeps the well-formed, distinct entries of a saved list. */
export function restoreBookmarks(raw: unknown): View[] {
  if (!Array.isArray(raw)) return [];
  const out: View[] = [];
  for (const v of raw as unknown[]) {
    if (!isWellFormedView(v)) continue;
    const view: View =
      v.kind === "topic"
        ? { kind: "topic", topicId: v.topicId }
        : v.kind === "note"
          ? { kind: "note", noteId: v.noteId }
          : bookmarkView({ kind: v.kind } as View);
    if (!isBookmarked(out, view)) out.push(view);
  }
  return out;
}

