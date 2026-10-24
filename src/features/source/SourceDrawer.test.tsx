import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SourceContext } from "../../api/contract";
import { renderWithProviders } from "../../test/renderWithProviders";
import { SourceDrawer } from "./SourceDrawer";
import { focusMessage, transcriptText } from "./model/contextWindow";
import { useSourceDrawer } from "./sourceDrawerStore";

const CTX: SourceContext = {
  app: "chatgpt",
  conversationId: "c1",
  conversationTitle: "Half-life",
  conversationUrl: null,
  focusMessageId: "m2",
  messages: [
    { id: "m1", speaker: "user", text: "Key off message time?", timestamp: "2026-09-01T10:00:00Z" },
    { id: "m2", speaker: "assistant", text: "Yes, message timestamps.", timestamp: "2026-09-01T10:00:05Z" },
  ],
};

describe("contextWindow", () => {
  it("finds the focus message and builds a labelled transcript", () => {
    expect(focusMessage(CTX)?.text).toBe("Yes, message timestamps.");
    expect(transcriptText(CTX)).toBe("You: Key off message time?\n\nChatGPT: Yes, message timestamps.");
  });
});

describe("SourceDrawer", () => {
  beforeEach(() => useSourceDrawer.setState({ messageId: null }));

  it("renders nothing until a message is opened", () => {
    const { container } = renderWithProviders(<SourceDrawer />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the conversation with the focus message highlighted (mock transport)", async () => {
    useSourceDrawer.getState().open("m4");
    renderWithProviders(<SourceDrawer />);

    expect(await screen.findByText("Neural graph of my chats")).toBeInTheDocument();
    const focus = screen.getByText(/Give each topic a state you control/).closest("li");
    expect(focus).toHaveAttribute("aria-current", "true");
    expect(focus).toHaveAttribute("data-speaker", "assistant");
  });

  it("shows a friendly error for a missing message", async () => {
    useSourceDrawer.getState().open("does-not-exist");
    renderWithProviders(<SourceDrawer />);

    expect(await screen.findByText(/no longer exists/)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    useSourceDrawer.getState().open("m4");
    renderWithProviders(<SourceDrawer />);
    await screen.findByRole("dialog");

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
