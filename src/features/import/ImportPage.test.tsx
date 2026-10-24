import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { USER_MESSAGES } from "../../api/errors";
import { mockTransport } from "../../api/mock/mockTransport";
import { setTransport } from "../../api/transport";
import { renderWithProviders } from "../../test/renderWithProviders";
import { activeTab, currentView } from "../workspace/model/tabs";
import { useWorkspace } from "../workspace/workspaceStore";
import { useJobEvents } from "./useJobEvents";
import { useJobStore } from "./jobStore";
import { ImportPage } from "./ImportPage";

function Harness() {
  useJobEvents();
  return <ImportPage />;
}

describe("ImportPage (mock transport)", () => {
  beforeEach(() => useJobStore.setState({ pipelines: {}, finished: {} }));

  it("points Gemini users to pairing the extension in Settings", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    expect(screen.getByText(/Gemini has no export file/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pair the browser extension in Settings" }));

    expect(currentView(activeTab(useWorkspace.getState().ws)).kind).toBe("settings");
  });

  it("estimates the export, then runs the import through every stage", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.type(screen.getByLabelText("Export path"), "C:/exports/claude.zip");
    await user.click(screen.getByRole("button", { name: "Use this file" }));

    expect(await screen.findByText("$7.35")).toBeInTheDocument();
    expect(screen.getByText("Claude export")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import and extract" }));

    await waitFor(() => expect(screen.getByText(/Import finished/)).toBeInTheDocument(), { timeout: 12_000 });
    const steps = screen.getAllByRole("listitem");
    expect(steps.every((li) => li.getAttribute("data-status") === "done")).toBe(true);
  }, 15_000);

  it("cancels a running import and says what was kept", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.type(screen.getByLabelText("Export path"), "C:/exports/claude.zip");
    await user.click(screen.getByRole("button", { name: "Use this file" }));
    await user.click(await screen.findByRole("button", { name: "Import and extract" }));

    await user.click(await screen.findByRole("button", { name: "Cancel import" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/Import cancelled/);
    expect(screen.queryByRole("button", { name: "Cancel import" })).not.toBeInTheDocument();
  });

  it("shows a friendly error when the file is not an export", async () => {
    setTransport({
      ...mockTransport,
      invoke: async (command, args) =>
        command === "estimate_import"
          ? Promise.reject({ code: "bad_zip", message: "no conversations.json found" })
          : mockTransport.invoke(command, args),
    });
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.type(screen.getByLabelText("Export path"), "C:/Downloads/photos.zip");
    await user.click(screen.getByRole("button", { name: "Use this file" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(USER_MESSAGES.bad_zip);
    expect(screen.queryByRole("region", { name: "Import estimate" })).not.toBeInTheDocument();
  });
});
