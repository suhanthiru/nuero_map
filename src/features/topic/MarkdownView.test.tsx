import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TopicSummary } from "../../api/contract";
import { MarkdownView } from "./MarkdownView";
import { suggestTopics } from "./model/suggest";

function topic(id: string, title: string, decay = 0.5, aliases: string[] = []): TopicSummary {
  return { id, title, aliases, state: "active", decay, ideaCount: 1, summary: `About ${title}`, createdAt: "", lastActiveAt: "", checkInAt: null };
}

const TOPICS = [topic("a", "Async Rust", 0.4, ["tokio"]), topic("b", "Robot arm", 0.9)];

function renderNote(body: string, onToggleTask = vi.fn(), onOpenTopic = vi.fn()) {
  render(<MarkdownView body={body} topics={TOPICS} onOpenTopic={onOpenTopic} onToggleTask={onToggleTask} />);
  return { onToggleTask, onOpenTopic };
}

describe("MarkdownView", () => {
  it("renders callouts with a default title, a custom title, and folding", async () => {
    const user = userEvent.setup();
    renderNote("> [!tip]\n> Default title\n\n> [!warning]- Careful *now*\n> Hidden body\n\n> plain quote");

    const [tip, warning] = screen.getAllByRole("note");
    expect(tip).toHaveTextContent("Tip");
    expect(tip).toHaveTextContent("Default title");
    const fold = screen.getByRole("button", { name: "Careful now" });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Hidden body")).not.toBeVisible();

    await user.click(fold);

    expect(screen.getByText("Hidden body")).toBeVisible();
    expect(warning).toContainElement(fold);
    expect(screen.getByText("plain quote").closest("blockquote")).not.toBeNull();
  });

  it("opens linked topics by title or alias and dims unknown ones", async () => {
    const user = userEvent.setup();
    const { onOpenTopic } = renderNote("[[Async Rust]], [[tokio|the runtime]] and [[Nope]]");

    await user.click(screen.getByRole("button", { name: "the runtime" }));

    expect(onOpenTopic).toHaveBeenCalledWith("a", expect.anything());
    // Focus shows the preview card at once (hover waits a moment).
    expect(await screen.findByRole("tooltip")).toHaveTextContent("About Async Rust");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.queryByRole("button", { name: "Nope" })).toBeNull();
  });

  it("only lets web links leave the app", () => {
    renderNote("[site](https://example.com) and [local](file:///c:/secret) and [js](javascript:alert(1))");

    expect(screen.getByRole("link", { name: "site" })).toHaveAttribute("href", "https://example.com");
    expect(screen.queryByRole("link", { name: "local" })).toBeNull();
    expect(screen.queryByRole("link", { name: "js" })).toBeNull();
  });

  it("toggles a task by its source line and renders headings two levels down", async () => {
    const user = userEvent.setup();
    const { onToggleTask } = renderNote("# Plan\n\n- [ ] first\n- [x] second");

    expect(screen.getByRole("heading", { level: 3, name: "Plan" })).toHaveAttribute("data-outline", "note-L1");
    expect(screen.getByRole("checkbox", { name: "first" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "second" }));

    expect(onToggleTask).toHaveBeenCalledWith(4);
  });

  it("never renders raw HTML from a note", () => {
    const { container } = render(<MarkdownView body={'<img src=x onerror="alert(1)"><script>alert(1)</script>'} topics={[]} onOpenTopic={vi.fn()} />);

    expect(container.querySelector("img, script")).toBeNull();
  });
});

describe("suggestTopics", () => {
  it("ranks prefix matches first, then by how alive the topic is", () => {
    const topics = [topic("x", "Learning async Rust", 0.9), topic("y", "Async Rust pitfalls", 0.2), topic("z", "Cooking", 1, ["rusty pan"])];

    expect(suggestTopics(topics, "rust").map((t) => t.id)).toEqual(["z", "x", "y"]);
    expect(suggestTopics(topics, "async").map((t) => t.id)).toEqual(["y", "x"]);
    expect(suggestTopics(topics, "").map((t) => t.id)).toEqual(["z", "x", "y"]);
  });
});
