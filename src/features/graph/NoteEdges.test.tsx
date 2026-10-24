import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GraphEdge } from "../../api/contract";
import { renderWorkspace } from "../../test/renderWorkspace";
import { describeEdge, edgeEvidenceLabel } from "./model/describe";

function edge(kind: GraphEdge["kind"], evidenceCount: number, linkedInNote = false): GraphEdge {
  return { id: "e", source: "a", target: "b", kind, strength: 0.5, evidenceCount, lastSeenAt: "", linkedInNote };
}

describe("note links on the map", () => {
  it("names note links as links, not excerpts", () => {
    expect(edgeEvidenceLabel(edge("note", 1))).toBe("1 note link");
    expect(edgeEvidenceLabel(edge("note", 3))).toBe("3 note links");
    expect(edgeEvidenceLabel(edge("cooccurrence", 1))).toBe("1 excerpt");
    expect(describeEdge(edge("explicit", 2, true), "A", "B")).toBe("A and B: you connected these, also linked in a note, 2 excerpts.");
    expect(describeEdge(edge("note", 1, true), "A", "B")).toBe("A and B: you linked these in a note, 1 note link.");
  });

  it("shows a link written in a note as a connection, with the note line as its evidence", async () => {
    const user = userEvent.setup();
    renderWorkspace({ kind: "graph", focusTopicId: "t-neural-map" });

    const peek = await screen.findByRole("region", { name: "Topic: Neural map of my chats" });
    await user.click(within(peek).getByRole("button", { name: /you linked these in a note · 1 note link →/ }));

    const evidence = await screen.findByRole("region", { name: "Connection evidence" });
    await waitFor(() => expect(within(evidence).getByText("Linked in your notes; no chat excerpts yet")).toBeInTheDocument());
    expect(within(evidence).getByText(/, line 15/)).toBeInTheDocument();
    expect(within(evidence).getByText("systems thinking keeps showing up.")).toBeInTheDocument();
  });
});
