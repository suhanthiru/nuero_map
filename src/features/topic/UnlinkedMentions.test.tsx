import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { call } from "../../api/api";
import { renderWorkspace } from "../../test/renderWorkspace";

async function unlinkedSection() {
  return screen.findByRole("region", { name: "Unlinked mentions" });
}

describe("Unlinked mentions and note links (mock transport)", () => {
  it("is folded with a count, and shows the matched words when unfolded", async () => {
    const user = userEvent.setup();
    renderWorkspace({ kind: "topic", topicId: "t-decay" });
    const section = await unlinkedSection();
    const toggle = within(section).getByRole("button", { name: "Unfold unlinked mentions" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // The Systems note names it twice: by title, and by its alias "half-life".
    expect(await within(section).findByText((_, el) => el?.textContent === "2 mentions")).toBeInTheDocument();
    await user.click(toggle);

    expect(within(section).getByRole("button", { name: "Thinking in Systems notes" })).toBeInTheDocument();
    expect(within(section).getByText("decay scoring for ideas").tagName).toBe("MARK");
    expect(within(section).getByText("half-life").tagName).toBe("MARK");
  });

  it("links a note mention in place, turning it into a connection", async () => {
    const user = userEvent.setup();
    renderWorkspace({ kind: "topic", topicId: "t-decay" });
    const section = await unlinkedSection();
    await user.click(within(section).getByRole("button", { name: "Unfold unlinked mentions" }));

    await user.click(await within(section).findByRole("button", { name: /Link “decay scoring for ideas” on line \d+ of your note on Thinking in Systems notes/ }));

    await waitFor(() =>
      expect(within(section).getByRole("status")).toHaveTextContent("Linked “decay scoring for ideas” in your note on Thinking in Systems notes."),
    );
    const note = await call("get_topic_note", { topicId: "t-systems-book" });
    expect(note.body).toContain("Stocks and flows map neatly onto [[Decay scoring for ideas|decay scoring for ideas]]: mentions are inflows,");
    await waitFor(() => expect(within(section).queryByText("decay scoring for ideas")).not.toBeInTheDocument());
    expect(within(section).getByText("half-life")).toBeInTheDocument();
    const mentions = screen.getByRole("region", { name: "Linked mentions" });
    // The Thinking in Systems connection now carries the note line that links it.
    await waitFor(() => expect(within(mentions).getByText(/Stocks and flows map neatly onto decay scoring for ideas/)).toBeInTheDocument());
  });

  it("links an idea mention by adding a line to this topic's note", async () => {
    const user = userEvent.setup();
    renderWorkspace({ kind: "topic", topicId: "t-homelab" });
    const section = await unlinkedSection();
    await user.click(within(section).getByRole("button", { name: "Unfold unlinked mentions" }));

    expect(await within(section).findByText("homelab")).toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: "Link Robot arm side project from this topic's note" }));

    await waitFor(async () => expect((await call("get_topic_note", { topicId: "t-homelab" })).body).toBe("- [[Robot arm side project]]\n"));
    const mentions = screen.getByRole("region", { name: "Linked mentions" });
    await waitFor(() => expect(within(mentions).getByRole("button", { name: "Robot arm side project" })).toBeInTheDocument());
    expect(within(mentions).getByText("note link")).toBeInTheDocument();
  });

  it("shows a note-only connection with the note line that makes it", async () => {
    renderWorkspace({ kind: "topic", topicId: "t-neural-map" });
    const mentions = await screen.findByRole("region", { name: "Linked mentions" });

    expect(await within(mentions).findByText("you linked these in a note")).toBeInTheDocument();
    expect(within(mentions).getByRole("button", { name: "Show the link on the map →" })).toBeInTheDocument();
    expect(within(mentions).getAllByText(/also linked in a note/).length).toBeGreaterThan(0);
  });
});
