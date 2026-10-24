import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { TopicSummary } from "../../../api/contract";
import { LivePreviewEditor } from "./LivePreviewEditor";

function topic(id: string, title: string): TopicSummary {
  return { id, title, aliases: [], state: "active", decay: 0.5, ideaCount: 1, summary: "", createdAt: "", lastActiveAt: "", checkInAt: null };
}

const TOPICS = [topic("robot", "Robot arm")];

function mount(initial: string) {
  const onSave = vi.fn((_body: string) => Promise.resolve());
  const onDone = vi.fn();
  const onOpenTopic = vi.fn();
  const utils = render(<LivePreviewEditor initial={initial} external={initial} topics={TOPICS} onSave={onSave} onDone={onDone} onOpenTopic={onOpenTopic} />);
  const content = screen.getByRole("textbox", { name: "My notes, in markdown" });
  const view = EditorView.findFromDOM(content)!;
  return { ...utils, content, view, onSave, onDone, onOpenTopic };
}

afterEach(() => vi.useRealTimers());

describe("LivePreviewEditor", () => {
  it("opens a rendered [[link]] on click, and the one under the caret with Alt+Enter", () => {
    const { container, content, view, onOpenTopic } = mount("see [[Robot arm]] soon\n");
    const link = container.querySelector<HTMLElement>(".cm-lp-wikilink")!;
    expect(link).toHaveTextContent("Robot arm");

    fireEvent.mouseDown(link, { button: 0 });
    expect(onOpenTopic).toHaveBeenCalledWith("robot", expect.anything());

    act(() => view.dispatch({ selection: EditorSelection.cursor(8) }));
    fireEvent.keyDown(content, { key: "Enter", altKey: true });
    expect(onOpenTopic).toHaveBeenCalledTimes(2);
  });

  it("ticks a task from its checkbox without moving the caret", () => {
    const { container, view } = mount("- [ ] write tests\n");
    const box = container.querySelector<HTMLInputElement>("input.cm-lp-checkbox")!;
    expect(box).toHaveAccessibleName("write tests");

    fireEvent.click(box);

    expect(view.state.doc.toString()).toBe("- [x] write tests\n");
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
  });

  it("saves a moment after typing stops, and flushes what's left when it closes", () => {
    vi.useFakeTimers();
    const { view, onSave, unmount } = mount("");

    act(() => view.dispatch(view.state.replaceSelection("Hello")));
    expect(onSave).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(800));
    expect(onSave).toHaveBeenLastCalledWith("Hello");

    act(() => view.dispatch(view.state.replaceSelection(" world")));
    unmount();
    expect(onSave).toHaveBeenLastCalledWith("Hello world");
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("mounts a note whose link spans two lines without crashing", () => {
    const { view } = mount('see [a](http://x "ti\ntle") more\n');
    act(() => view.dispatch({ selection: EditorSelection.cursor(0) }));
    expect(view.state.doc.lines).toBe(3);
  });

  it("bolds the selection with Ctrl+B and leaves on Esc", () => {
    const { content, view, onDone } = mount("make this loud");
    act(() => view.dispatch({ selection: EditorSelection.range(10, 14) }));

    fireEvent.keyDown(content, { key: "b", ctrlKey: true });
    expect(view.state.doc.toString()).toBe("make this **loud**");

    fireEvent.keyDown(content, { key: "Escape" });
    expect(onDone).toHaveBeenCalled();
  });
});
