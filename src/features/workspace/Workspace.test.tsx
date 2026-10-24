import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWorkspace } from "../../test/renderWorkspace";
import { reloadWorkspace, useWorkspace } from "./workspaceStore";

const tabBars = () => screen.getAllByRole("tablist", { name: "Open tabs" });

describe("Workspace (mock transport)", () => {
  it("runs a command from the palette", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.keyboard("{Control>}p{/Control}");
    const palette = await screen.findByRole("dialog", { name: "Command palette" });
    await user.type(within(palette).getByRole("combobox", { name: "Find a command" }), "split right");
    expect(within(palette).getAllByRole("option")[0]).toHaveTextContent("Split right");
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
    expect(tabBars()).toHaveLength(2);
    expect(screen.getByRole("separator", { name: "Resize pane 1 and pane 2" })).toHaveAttribute("aria-valuenow", "50");
  });

  it("doesn't change tabs behind an open dialog, and a held Ctrl+W closes only one tab", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const { open } = useWorkspace.getState();
    open({ kind: "graph" }, { newTab: true });
    open({ kind: "settings" }, { newTab: true });
    const tabs = () => within(tabBars()[0]).getAllByRole("tab");
    await waitFor(() => expect(tabs()).toHaveLength(3));

    await user.keyboard("{Control>}p{/Control}");
    await screen.findByRole("dialog", { name: "Command palette" });
    await user.keyboard("{Control>}w{/Control}");
    expect(tabs()).toHaveLength(3);
    await user.keyboard("{Escape}");

    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    fireEvent.keyDown(window, { key: "w", ctrlKey: true, repeat: true });
    fireEvent.keyDown(window, { key: "w", ctrlKey: true, repeat: true });
    expect(tabs()).toHaveLength(2);
  });

  it("closes the other tabs from a tab's context menu", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const { open } = useWorkspace.getState();
    open({ kind: "graph" }, { newTab: true });
    open({ kind: "settings" }, { newTab: true });
    const graphTab = await screen.findByRole("tab", { name: /Graph view/ });

    fireEvent.contextMenu(graphTab, { button: 2, clientX: 40, clientY: 40 });
    const menu = await screen.findByRole("menu", { name: "Tab: Graph view" });
    await user.click(within(menu).getByRole("menuitem", { name: "Close others" }));

    expect(within(tabBars()[0]).getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: /Graph view/ })).toHaveAttribute("aria-selected", "true");
  });

  it("opens a tab's menu from the keyboard and gives focus back on Esc", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const tab = await screen.findByRole("tab", { name: /Today/ });
    tab.focus();

    await user.keyboard("{Shift>}{F10}{/Shift}");
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Close" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).not.toBe(tab);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(tab).toHaveFocus();
  });

  it("splits right from More options, and each pane keeps its own tabs", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Split right" }));
    expect(tabBars()).toHaveLength(2);

    await user.click(within(tabBars()[1]).getByRole("tab", { name: /Today/ }));
    useWorkspace.getState().open({ kind: "graph" }, { newTab: true });

    await waitFor(() => expect(within(tabBars()[1]).getAllByRole("tab")).toHaveLength(2));
    expect(within(tabBars()[0]).getAllByRole("tab")).toHaveLength(1);
    // Closing the right pane's tabs closes the pane.
    for (const t of within(tabBars()[1]).getAllByRole("button", { name: /^Close / })) await user.click(t);
    expect(tabBars()).toHaveLength(1);
  });

  it("resizes panes from the keyboard", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    useWorkspace.getState().splitRight();
    const divider = await screen.findByRole("separator", { name: /Resize pane/ });

    divider.focus();
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");

    expect(divider).toHaveAttribute("aria-valuenow", "60");
  });

  it("bookmarks a topic from the explorer and keeps it after a restart", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const explorer = await screen.findByRole("list", { name: "Topics by state" });
    const row = await within(explorer).findByRole("button", { name: /Decay scoring for ideas/ });

    fireEvent.contextMenu(row, { button: 2, clientX: 10, clientY: 10 });
    await user.click(await screen.findByRole("menuitem", { name: "Bookmark" }));
    await user.click(screen.getByRole("tab", { name: "Bookmarks" }));

    const list = screen.getByRole("list", { name: "Bookmarks" });
    expect(within(list).getByRole("button", { name: /Decay scoring for ideas/ })).toBeInTheDocument();

    const saved = JSON.parse(window.localStorage.getItem("neural-map.workspace") ?? "{}") as { bookmarks?: unknown };
    expect(saved.bookmarks).toEqual([{ kind: "topic", topicId: "t-decay" }]);
    reloadWorkspace();
    expect(useWorkspace.getState().bookmarks).toEqual([{ kind: "topic", topicId: "t-decay" }]);
  });

  it("changes the explorer's sort order from its menu", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const explorer = await screen.findByRole("list", { name: "Topics by state" });
    await within(explorer).findByRole("button", { name: /Decay scoring for ideas/ });

    await user.click(screen.getByRole("button", { name: /Change sort order/ }));
    await user.click(screen.getByRole("menuitemradio", { name: "Most ideas" }));

    const tree = screen.getByRole("list", { name: "Topics by state" });
    const active = within(tree).getByRole("button", { name: /^Active/ }).closest("li") as HTMLElement;
    expect(within(active).getAllByRole("button")[1]).toHaveTextContent("Neural map of my chats");
    expect(screen.getByRole("button", { name: /Change sort order \(Most ideas\)/ })).toBeInTheDocument();
  });

  it("shows the focused topic's backlinks and note size in the status bar", async () => {
    const user = userEvent.setup();
    renderWorkspace({ kind: "topic", topicId: "t-neural-map" });

    const backlinks = await screen.findByRole("button", { name: /\d+ backlinks?/ });
    expect(await screen.findByText(/\d+ words · \d+ characters/)).toBeInTheDocument();
    useWorkspace.getState().setRightPane("outline");
    await user.click(backlinks);

    expect(useWorkspace.getState().rightPane).toBe("connections");
  });

  it("lists keyboard shortcuts from the help button", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });

    expect(within(dialog).getByText("Open command palette")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("pinned tabs", () => {
    it("pins a tab from its menu; Ctrl+W, middle-click and Close leave it, the pin unpins it", async () => {
      const user = userEvent.setup();
      renderWorkspace({ kind: "topic", topicId: "t-decay" });
      const tab = await screen.findByRole("tab", { name: "Decay scoring for ideas" });

      fireEvent.contextMenu(tab, { button: 2, clientX: 40, clientY: 40 });
      await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Pin" }));

      const pinned = screen.getByRole("tab", { name: "Decay scoring for ideas, pinned" });
      fireEvent.keyDown(window, { key: "w", ctrlKey: true });
      fireEvent(pinned, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
      expect(screen.getByRole("tab", { name: "Decay scoring for ideas, pinned" })).toBeInTheDocument();
      expect(await screen.findByText("Unpin the tab to close it")).toBeInTheDocument();
      fireEvent.contextMenu(pinned, { button: 2, clientX: 40, clientY: 40 });
      expect(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Close" })).toBeDisabled();
      await user.keyboard("{Escape}");

      await user.click(screen.getByRole("button", { name: "Unpin Decay scoring for ideas" }));
      expect(screen.getByRole("tab", { name: "Decay scoring for ideas" })).toBeInTheDocument();
    });

    it("opens a topic from the explorer in a new tab instead of replacing a pinned one", async () => {
      const user = userEvent.setup();
      renderWorkspace({ kind: "topic", topicId: "t-decay" });
      const explorer = await screen.findByRole("list", { name: "Topics by state" });
      useWorkspace.getState().togglePin(useWorkspace.getState().ws.activeId);

      await user.click(await within(explorer).findByRole("button", { name: /Learning async Rust/ }));

      const tabs = within(tabBars()[0]).getAllByRole("tab");
      expect(tabs.map((t) => t.getAttribute("aria-label"))).toEqual(["Decay scoring for ideas, pinned", "Learning async Rust"]);
      expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    });

    it("keeps pinned tabs through Close others and a restart", async () => {
      const user = userEvent.setup();
      renderWorkspace({ kind: "topic", topicId: "t-decay" });
      await screen.findByRole("tab", { name: "Decay scoring for ideas" });
      const st = useWorkspace.getState();
      const pinnedId = st.ws.activeId;
      st.togglePin(pinnedId);
      st.open({ kind: "graph" }, { newTab: true });
      st.open({ kind: "settings" }, { newTab: true });
      const graph = await screen.findByRole("tab", { name: "Graph view" });

      fireEvent.contextMenu(graph, { button: 2, clientX: 40, clientY: 40 });
      await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Close others" }));

      expect(within(tabBars()[0]).getAllByRole("tab").map((t) => t.getAttribute("aria-label"))).toEqual([
        "Decay scoring for ideas, pinned",
        "Graph view",
      ]);
      reloadWorkspace();
      expect(useWorkspace.getState().ws.tabs.find((t) => t.id === pinnedId)?.pinned).toBe(true);
    });
  });
});
