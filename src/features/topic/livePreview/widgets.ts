import { EditorView, WidgetType } from "@codemirror/view";
import type { CalloutKind } from "../model/callouts";

/** A task's `[ ]` / `[x]` as a checkbox; clicking it flips the character in the note. */
export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly label: string,
  ) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.label === this.label;
  }

  /** Typing in the task's text only renames the box; keep the same element. */
  updateDOM(dom: HTMLElement): boolean {
    if (!(dom instanceof HTMLInputElement)) return false;
    dom.checked = this.checked;
    dom.setAttribute("aria-label", this.label || "Task");
    return true;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "cm-lp-checkbox";
    box.checked = this.checked;
    box.tabIndex = -1;
    box.setAttribute("aria-label", this.label || "Task");
    // Keep the caret where it is; the click flips the task instead of moving into it.
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      e.preventDefault();
      // Read the state from the note, not this widget: updateDOM reuses the element across states.
      const at = view.posAtDOM(box);
      const marker = view.state.doc.sliceString(at, at + 3);
      if (!/^\[[ xX]\]$/.test(marker)) return;
      view.dispatch({ changes: { from: at + 1, to: at + 2, insert: marker[1] === " " ? "x" : " " }, userEvent: "input.toggle-task" });
    });
    return box;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/** Stands in for a callout's `[!type]` marker: an icon, plus the type as the title when none is written. */
export class CalloutMarkerWidget extends WidgetType {
  constructor(
    readonly kind: CalloutKind,
    readonly label: string,
  ) {
    super();
  }

  eq(other: CalloutMarkerWidget): boolean {
    return other.kind === this.kind && other.label === this.label;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-lp-callout-marker";
    span.dataset.callout = this.kind;
    const icon = document.createElement("span");
    icon.className = "cm-lp-callout-icon";
    icon.setAttribute("aria-hidden", "true");
    span.appendChild(icon);
    if (this.label) span.appendChild(document.createTextNode(this.label));
    else {
      // With a written title the type is only the icon's colour; say it for screen readers.
      const kind = document.createElement("span");
      kind.className = "visually-hidden";
      kind.textContent = `${this.kind.charAt(0).toUpperCase()}${this.kind.slice(1)}: `;
      span.appendChild(kind);
    }
    return span;
  }
}

/** `---` drawn as a rule while the caret is elsewhere. */
export class RuleWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-lp-rule";
    span.setAttribute("role", "separator");
    return span;
  }
}
