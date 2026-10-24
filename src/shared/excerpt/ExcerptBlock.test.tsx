import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Excerpt } from "../../api/contract";
import { ExcerptBlock } from "./ExcerptBlock";

function excerpt(speaker: "user" | "assistant", app: "claude" | "chatgpt" | "gemini" = "claude"): Excerpt {
  return {
    text: speaker === "user" ? "my own idea" : "the model's reply",
    source: { messageId: "m9", conversationId: "c1", app, speaker, timestamp: "2026-09-21T10:00:00Z" },
  };
}

describe("ExcerptBlock", () => {
  it("marks the user's words as the user's voice", () => {
    const { container } = render(<ExcerptBlock excerpt={excerpt("user")} />);

    expect(container.querySelector("figure")).toHaveAttribute("data-speaker", "user");
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("my own idea")).toBeInTheDocument();
  });

  it("labels AI words with the assistant app name", () => {
    const { container } = render(<ExcerptBlock excerpt={excerpt("assistant", "gemini")} />);

    expect(container.querySelector("figure")).toHaveAttribute("data-speaker", "assistant");
    expect(screen.getAllByText("Gemini").length).toBeGreaterThanOrEqual(1);
  });

  it("opens the source message when asked", async () => {
    const onOpen = vi.fn();
    render(<ExcerptBlock excerpt={excerpt("assistant")} onOpenSource={onOpen} />);

    await userEvent.click(screen.getByRole("button", { name: "open source" }));

    expect(onOpen).toHaveBeenCalledWith("m9");
  });

  it("can hide the metadata row", () => {
    render(<ExcerptBlock excerpt={excerpt("user")} showMeta={false} />);

    expect(screen.queryByText("You")).not.toBeInTheDocument();
  });
});
