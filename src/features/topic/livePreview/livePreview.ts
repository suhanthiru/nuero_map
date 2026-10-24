import { syntaxTree } from "@codemirror/language";
import { StateEffect, type EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { isExternalUrl } from "../../../shared/links/openExternal";
import { buildPreview } from "./decorations";

export interface LinkHandlers {
  readonly resolves: (target: string) => boolean;
  /** A rendered `[[link]]` was clicked (Ctrl/middle-click for a new tab, as elsewhere). */
  readonly openTarget: (target: string, e: MouseEvent) => void;
  readonly openUrl: (href: string) => void;
}

/** Ask the preview to rebuild, e.g. when the topic list changes and links resolve differently. */
export const refreshPreview = StateEffect.define<null>();

const LINK_SELECTOR = ".cm-lp-wikilink, .cm-lp-external";
const RELEASE_EVENTS = ["mouseup", "dragend", "drop", "contextmenu", "blur"] as const;

/** The `[[target]]` the caret sits in, if any. */
export function wikilinkAt(state: EditorState, pos: number): string | null {
  for (const side of [-1, 1] as const) {
    for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side); node; node = node.parent) {
      if (node.name !== "WikiLink") continue;
      const target = node.getChild("WikiLinkTarget");
      return target ? state.sliceDoc(target.from, target.to) : null;
    }
  }
  return null;
}

/**
 * The live preview layer. Decorations freeze while the mouse is down, so text never
 * re-flows under the pointer mid-click; they rebuild on release.
 */
export function livePreview(handlers: () => LinkHandlers) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      mouseDown = false;

      constructor(readonly view: EditorView) {
        this.decorations = this.build();
      }

      build(): DecorationSet {
        const { from, to } = this.view.viewport;
        return buildPreview(this.view.state, { focused: this.view.hasFocus, resolves: (t) => handlers().resolves(t), from, to });
      }

      update(u: ViewUpdate) {
        const refresh = u.transactions.some((t) => t.effects.some((e) => e.is(refreshPreview)));
        if (this.mouseDown && !refresh) {
          this.decorations = this.decorations.map(u.changes);
          return;
        }
        if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged || refresh || syntaxTree(u.startState) !== syntaxTree(u.state)) {
          this.decorations = this.build();
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        mousedown(e, view) {
          const el = e.target instanceof Element ? e.target.closest<HTMLElement>(LINK_SELECTOR) : null;
          // Only links that lead somewhere take the click; an unresolved one places the caret like text.
          const target = el?.dataset.target;
          const href = el?.dataset.href;
          const openable = el && ((target !== undefined && handlers().resolves(target)) || (href && isExternalUrl(href)));
          if (openable && (e.button === 0 || e.button === 1)) {
            e.preventDefault();
            if (target !== undefined) handlers().openTarget(target, e);
            else if (href) handlers().openUrl(href);
            return true;
          }
          this.mouseDown = true;
          // Some presses never end in a mouseup here (text dragged away, a context menu, the
          // window losing focus); any of these, or a move with no button held, ends the freeze.
          const release = () => {
            if (!this.mouseDown) return;
            this.mouseDown = false;
            for (const type of RELEASE_EVENTS) window.removeEventListener(type, release, true);
            window.removeEventListener("mousemove", onMove, true);
            view.dispatch({ effects: refreshPreview.of(null) });
          };
          const onMove = (ev: MouseEvent) => {
            if (ev.buttons === 0) release();
          };
          for (const type of RELEASE_EVENTS) window.addEventListener(type, release, true);
          window.addEventListener("mousemove", onMove, true);
          return false;
        },
      },
    },
  );
}
