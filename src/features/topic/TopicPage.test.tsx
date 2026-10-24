import { describe, expect, it } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { acceptCompletion, completionStatus, currentCompletions, startCompletion } from "@codemirror/autocomplete";
import { insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { call } from "../../api/api";
import { renderWorkspace } from "../../test/renderWorkspace";
import { useSourceDrawer } from "../source/sourceDrawerStore";

const COMPLETION_SETTLE_MS = 100;

function renderTopic(id = "t-neural-map") {
  return renderWorkspace({ kind: "topic", topicId: id });
}

/** The live preview editor is CodeMirror; tests drive it through its view, as typing would. */
async function openEditor(notes: HTMLElement): Promise<{ content: HTMLElement; view: EditorView }> {
  const content = await within(notes).findByRole("textbox", { name: "My notes, in markdown" });
  const view = EditorView.findFromDOM(content);
  if (!view) throw new Error("no editor view");
  return { content, view };
}

function typeInto(view: EditorView, text: string): void {
  act(() => view.dispatch(view.state.replaceSelection(text), { userEvent: "input.type" }));
}

describe("TopicPage (mock transport)", () => {
  it("reads like a note: inline title, properties, then sections", async () => {
    renderTopic();

    expect(await screen.findByRole("textbox", { name: "Topic title (edit to rename)" })).toHaveValue("Neural map of my chats");
    const props = screen.getByRole("region", { name: "Properties" });
    expect(within(props).getByText("idea graph")).toBeInTheDocument();
    expect(within(props).getByRole("meter", { name: "How alive this topic is" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Current state" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "My notes" })).toBeInTheDocument();
  });

  it("shows the cited current state and opens a citation's source", async () => {
    const user = userEvent.setup();
    renderTopic();

    const state = await screen.findByRole("region", { name: "Current state" });
    const cites = within(state).getAllByRole("button", { name: /^Source \d/ });
    expect(cites.length).toBeGreaterThanOrEqual(4);

    await user.click(cites[0]);

    expect(useSourceDrawer.getState().messageId).toBe("m1");
  });

  it("changes state optimistically", async () => {
    const user = userEvent.setup();
    renderTopic();
    const parked = await screen.findByRole("radio", { name: "Parked" });

    await user.click(parked);

    expect(parked).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/On hold/)).toBeInTheDocument();
  });

  it("renames the topic from the inline title", async () => {
    const user = userEvent.setup();
    renderTopic("t-cold-brew");
    const title = await screen.findByRole("textbox", { name: "Topic title (edit to rename)" });

    await user.clear(title);
    await user.type(title, "Cold brew, settled{Enter}");

    await waitFor(async () => {
      const page = await call("get_topic_page", { id: "t-cold-brew" });
      expect(page.topic.title).toBe("Cold brew, settled");
    });
  });

  it("renders the note's markdown with topic links, tasks and callouts", async () => {
    const user = userEvent.setup();
    renderTopic();
    const notes = await screen.findByRole("region", { name: "My notes" });

    expect(await within(notes).findByRole("heading", { name: "Open questions" })).toBeInTheDocument();
    expect(within(notes).getByText("navigation").tagName).toBe("STRONG");
    expect(within(notes).getByRole("note")).toHaveTextContent("systems thinking keeps showing up");
    const checks = within(notes).getAllByRole("checkbox");
    expect(checks[0]).toBeChecked();
    expect(checks[1]).not.toBeChecked();
    expect(within(notes).getByText("wikilink")).toHaveAttribute("title", expect.stringMatching(/Nothing called/));

    await user.click(within(notes).getByRole("button", { name: "Decay scoring for ideas" }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Topic title (edit to rename)" })).toHaveValue("Decay scoring for ideas"));
  });

  it("checks a task off from the reading view and saves it", async () => {
    const user = userEvent.setup();
    renderTopic();
    const notes = await screen.findByRole("region", { name: "My notes" });
    const [, second] = await within(notes).findAllByRole("checkbox");

    await user.click(second);

    await waitFor(async () => {
      const note = await call("get_topic_note", { topicId: "t-neural-map" });
      expect(note.body).toContain("- [x] Should a [[wikilink]]");
    });
  });

  it("writes a note in the editing view, saving as you type and suggesting topic links", async () => {
    const user = userEvent.setup();
    renderTopic("t-homelab");
    const notes = await screen.findByRole("region", { name: "My notes" });

    await user.click(await within(notes).findByRole("button", { name: /Nothing written yet/ }));
    const { content, view } = await openEditor(notes);
    expect(content).toHaveFocus();

    typeInto(view, "- back up the [[tail");
    startCompletion(view);
    await waitFor(() => expect(currentCompletions(view.state)[0]?.label).toBe("Home server with Tailscale"));
    // CodeMirror ignores an accept in the first moments a list is open (so a fast Enter isn't swallowed).
    await act(() => new Promise((r) => setTimeout(r, COMPLETION_SETTLE_MS)));
    act(() => void acceptCompletion(view));
    act(() => void insertNewlineContinueMarkup(view));
    typeInto(view, "photos");

    expect(view.state.doc.toString()).toBe("- back up the [[Home server with Tailscale]]\n- photos");
    // Esc first closes any open suggestions; wait for the last keystroke's lookup to finish.
    await waitFor(() => expect(completionStatus(view.state)).toBeNull());
    fireEvent.keyDown(content, { key: "Escape" });

    expect(await within(notes).findByRole("button", { name: "Home server with Tailscale" })).toBeInTheDocument();
    await waitFor(async () => {
      const note = await call("get_topic_note", { topicId: "t-homelab" });
      expect(note.body).toBe("- back up the [[Home server with Tailscale]]\n- photos");
    });
  });

  it("folds restatements in the timeline and lets you pin a quote", async () => {
    const user = userEvent.setup();
    renderTopic();
    const timeline = await screen.findByRole("region", { name: "Timeline" });

    expect(within(timeline).getByRole("button", { name: /Show 1 restatement/ })).toBeInTheDocument();
    const pinButtons = within(timeline).getAllByRole("button", { name: "Pin this quote" });
    await user.click(pinButtons[0]);

    const gems = screen.getByRole("region", { name: "Pinned quotes" });
    await waitFor(() => expect(within(gems).getAllByRole("button", { name: "Unpin" })).toHaveLength(3));
    expect(pinButtons[0]).toHaveTextContent("Pinned");
  });

  it("folds a section from its heading", async () => {
    const user = userEvent.setup();
    renderTopic();
    const timeline = await screen.findByRole("region", { name: "Timeline" });

    await user.click(within(timeline).getByRole("button", { name: "Fold Timeline" }));

    expect(within(timeline).queryByRole("button", { name: /Show 1 restatement/ })).not.toBeInTheDocument();
    expect(within(timeline).getByRole("button", { name: "Unfold Timeline" })).toHaveAttribute("aria-expanded", "false");
  });

  it("lists linked mentions with strength and a way to the evidence", async () => {
    renderTopic();
    const mentions = await screen.findByRole("region", { name: "Linked mentions" });

    expect(within(mentions).getAllByLabelText(/Strength \d of 5/).length).toBe(5);
    expect(within(mentions).getAllByRole("button", { name: /excerpts on the map/ }).length).toBe(5);
  });

  it("shows the topic's neighbourhood in the right sidebar's local graph", async () => {
    const user = userEvent.setup();
    renderTopic();

    await user.click(await screen.findByRole("tab", { name: "Local graph" }));

    expect(await screen.findByRole("application", { name: /Local graph of Neural map of my chats with \d+ topics/ })).toBeInTheDocument();
  });

  it("explains a missing topic instead of crashing", async () => {
    renderTopic("nope");

    expect(await screen.findByText("Couldn't open this topic")).toBeInTheDocument();
  });

  it("keeps the last keystrokes when the editor closes before the autosave fires", async () => {
    const user = userEvent.setup();
    renderTopic("t-sleep");
    const notes = await screen.findByRole("region", { name: "My notes" });
    await user.click(await within(notes).findByRole("button", { name: /Nothing written yet/ }));

    const { view } = await openEditor(notes);
    typeInto(view, "Wake at 7");
    await act(async () => {
      await user.click(within(notes).getByRole("button", { name: "Done" }));
    });

    await waitFor(async () => expect((await call("get_topic_note", { topicId: "t-sleep" })).body).toBe("Wake at 7"));
  });
});
