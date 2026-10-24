import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JobKind, JobProgress } from "../../api/contract";
import { renderWorkspace } from "../../test/renderWorkspace";
import { useJobStore } from "../import/jobStore";

function renderHome() {
  return renderWorkspace({ kind: "today" });
}

function runningPipeline(rootKind: JobKind): JobProgress {
  const at = new Date().toISOString();
  return { jobId: "j2", rootJobId: "j1", kind: "extract", rootKind, stage: "extracting", done: 3, total: 10, updatedAt: at };
}

describe("HomePage (mock transport)", () => {
  beforeEach(() => useJobStore.setState({ pipelines: {}, finished: {} }));

  it("shows a running import in the banner", async () => {
    useJobStore.setState({ pipelines: { j1: runningPipeline("import") } });
    renderHome();

    expect(await screen.findByText(/Extracting ideas: 3 of 10/)).toBeInTheDocument();
  });

  it("leaves captured Gemini chats out of the import banner", async () => {
    useJobStore.setState({ pipelines: { j1: runningPipeline("capture") } });
    renderHome();
    await screen.findByRole("region", { name: "Most alive right now" });

    expect(screen.queryByText(/New topics will appear here/)).not.toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Processing Gemini chats");
  });

  it("shows the three shelf cards with their reasons in words", async () => {
    renderHome();
    const shelf = await screen.findByRole("region", { name: "Three to revisit today" });

    expect(await within(shelf).findAllByRole("article")).toHaveLength(3);
    expect(within(shelf).getByText("Hot but fading")).toBeInTheDocument();
    expect(within(shelf).getByText("From the shelf")).toBeInTheDocument();
    expect(within(shelf).getByText("New connection")).toBeInTheDocument();
  });

  it("ranks the most alive topics, highest first", async () => {
    renderHome();
    const alive = await screen.findByRole("region", { name: "Most alive right now" });

    const items = await within(alive).findAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Neural map of my chats");
    expect(items[0]).toHaveTextContent("96%");
  });

  it("searches and opens a topic with the keyboard", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(await screen.findByRole("searchbox", { name: /Search your topics/ }), "robot");
    expect(await screen.findByRole("option", { name: /Robot arm side project/ })).toBeInTheDocument();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("heading", { level: 1, name: "Robot arm side project" })).toBeInTheDocument();
  });
});
