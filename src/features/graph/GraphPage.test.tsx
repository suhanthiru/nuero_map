import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWorkspace } from "../../test/renderWorkspace";
import { activeTab, currentView } from "../workspace/model/tabs";
import { useWorkspace } from "../workspace/workspaceStore";
import { useGraphSettings } from "./state/graphSettingsStore";

function renderGraph(focusTopicId?: string, edgeId?: string) {
  return renderWorkspace({ kind: "graph", focusTopicId, edgeId });
}

describe("GraphPage (mock transport)", () => {
  it("renders an accessible, keyboard-focusable map with a legend", async () => {
    renderGraph();

    const map = await screen.findByRole("application", { name: /Topic map with 11 topics/ });
    expect(map).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: /legend/i })).toBeInTheDocument();
  });

  it("filters by state from the graph settings panel", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByText(/11 topics/);

    await user.click(screen.getByRole("button", { name: "Graph settings" }));
    const panel = screen.getByRole("dialog", { name: "Graph settings" });
    await user.click(within(panel).getByRole("button", { name: "Parked" }));

    expect(screen.getByText(/8 topics/)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Parked" })).toHaveAttribute("aria-pressed", "false");
  });

  it("narrows the map with a search filter", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByText(/11 topics/);

    await user.click(screen.getByRole("button", { name: "Graph settings" }));
    await user.type(screen.getByRole("searchbox", { name: "Show only topics matching" }), "decay");

    expect(screen.getByText(/^1 topics/)).toBeInTheDocument();
  });

  it("colors topics by group and explains the group in the legend", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByText(/11 topics/);

    await user.click(screen.getByRole("button", { name: "Graph settings" }));
    await user.click(screen.getByRole("button", { name: "Groups" }));
    await user.click(screen.getByRole("button", { name: "New group" }));
    await user.type(screen.getByRole("textbox", { name: "Blue group query" }), "decay");
    await user.click(screen.getByRole("button", { name: "Color: Blue. Change color" }));

    expect(useGraphSettings.getState().groups[0]).toMatchObject({ query: "decay", slot: 1 });
    await user.click(screen.getByRole("button", { name: "Legend" }));
    expect(screen.getByText(/Orange: “decay”/)).toBeInTheDocument();
  });

  it("applies force sliders live and restores defaults", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByText(/11 topics/);

    await user.click(screen.getByRole("button", { name: "Graph settings" }));
    await user.click(screen.getByRole("button", { name: "Forces" }));
    // jsdom doesn't step range inputs from the keyboard, so set the value directly.
    fireEvent.change(screen.getByRole("slider", { name: "Repel force" }), { target: { value: "11" } });
    expect(useGraphSettings.getState().forces.repel).toBe(11);
    expect(screen.getByText("11")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Restore default forces" }));
    expect(useGraphSettings.getState().forces.repel).toBe(10);
  });

  it("offers the same topics as a sortable table", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByText(/11 topics/);

    await user.click(screen.getByRole("radio", { name: "List" }));

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(12);
    expect(within(rows[1]).getByRole("button", { name: "Neural map of my chats" })).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "Topic" }));
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Capturing Wispr Flow notes");
  });

  it("finds a topic and shows its connections, then the evidence for one", async () => {
    const user = userEvent.setup();
    renderGraph();
    await screen.findByText(/11 topics/);

    await user.type(screen.getByRole("searchbox", { name: "Find a topic" }), "decay{Enter}");

    const peek = await screen.findByRole("region", { name: "Topic: Decay scoring for ideas" });
    await user.click(within(peek).getAllByRole("button", { name: /excerpts →/ })[0]);
    const evidence = await screen.findByRole("region", { name: "Connection evidence" });
    await waitFor(() => expect(within(evidence).getByText(/excerpts where they met/)).toBeInTheDocument());
  });

  it("opens with a topic focused when the tab asks for one", async () => {
    renderGraph("t-decay");

    expect(await screen.findByRole("region", { name: "Topic: Decay scoring for ideas" })).toBeInTheDocument();
  });

  it("opens the topic page in a new tab on Ctrl+click", async () => {
    const user = userEvent.setup();
    renderGraph("t-decay");
    const peek = await screen.findByRole("region", { name: "Topic: Decay scoring for ideas" });

    await user.keyboard("{Control>}");
    await user.click(within(peek).getByRole("button", { name: "Open topic page" }));
    await user.keyboard("{/Control}");

    const { ws } = useWorkspace.getState();
    expect(ws.tabs).toHaveLength(2);
    expect(currentView(activeTab(ws))).toEqual({ kind: "topic", topicId: "t-decay" });
  });
});
