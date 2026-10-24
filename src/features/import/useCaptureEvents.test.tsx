import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { mockEmit } from "../../api/mock/mockEvents";
import { renderWithProviders } from "../../test/renderWithProviders";
import { renderWorkspace } from "../../test/renderWorkspace";
import { Notices, useNotice } from "../workspace/notices";
import { useCaptureEvents, useCaptureStore } from "./useCaptureEvents";

function Harness() {
  useCaptureEvents();
  return <Notices />;
}

const capture = (newTurns = 2) => act(() => mockEmit("capture_received", { conversationId: "gemini-c1", newTurns }));

describe("useCaptureEvents", () => {
  beforeEach(() => {
    useCaptureStore.setState({ lastCaptureAt: null });
    useNotice.setState({ text: null, nonce: 0 });
  });

  it("toasts the first capture of the session only", async () => {
    renderWithProviders(<Harness />);

    await capture();
    expect(screen.getByRole("button", { name: "Captured from Gemini" })).toBeInTheDocument();
    await capture();
    await capture();

    expect(useNotice.getState().nonce).toBe(1);
  });

  it("records when the last turn arrived and refreshes the data", async () => {
    const { client } = renderWithProviders(<Harness />);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await capture();

    expect(useCaptureStore.getState().lastCaptureAt).not.toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["topics"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["graph"] });
  });

  it("ignores a re-send that added no turns", async () => {
    renderWithProviders(<Harness />);

    await capture(0);

    expect(useCaptureStore.getState().lastCaptureAt).toBeNull();
    expect(useNotice.getState().nonce).toBe(0);
  });

  it("stops listening when unmounted", async () => {
    const { unmount } = renderWithProviders(<Harness />);
    unmount();
    await act(async () => undefined); // unlisten resolves asynchronously, as Tauri's does

    await capture();

    expect(useCaptureStore.getState().lastCaptureAt).toBeNull();
  });

  it("shows the last capture quietly in the status bar", async () => {
    renderWorkspace();
    const footer = await screen.findByRole("contentinfo");
    expect(footer).not.toHaveTextContent("Gemini");

    await capture();

    expect(footer).toHaveTextContent(/Last capture from Gemini · \d{1,2}:\d{2}/);
  });
});
