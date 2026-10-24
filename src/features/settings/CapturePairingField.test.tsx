import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { USER_MESSAGES } from "../../api/errors";
import { mockTransport } from "../../api/mock/mockTransport";
import { setTransport } from "../../api/transport";
import { renderWithProviders } from "../../test/renderWithProviders";
import { SettingsPage } from "./SettingsPage";

async function renderPanel() {
  renderWithProviders(<SettingsPage />);
  const panel = await screen.findByRole("region", { name: "Gemini live capture" });
  await within(panel).findByLabelText("Pairing string");
  return panel;
}

function pairingOf(panel: HTMLElement): string {
  return (within(panel).getByLabelText("Pairing string") as HTMLInputElement).value;
}

describe("CapturePairingField (mock transport)", () => {
  // The mock backend is a module singleton: start each test with capture off on the default port.
  beforeEach(async () => {
    await mockTransport.invoke("set_settings", { patch: { captureEnabled: false, capturePort: 47831 } });
  });

  it("turns capture on and says where it listens", async () => {
    const user = userEvent.setup();
    const panel = await renderPanel();
    expect(within(panel).getByText("Off")).toHaveAttribute("role", "status");

    await user.click(within(panel).getByRole("checkbox", { name: "Capture Gemini chats" }));

    expect(await within(panel).findByText("Listening on 127.0.0.1:47831")).toHaveAttribute("data-ok", "true");
    expect(within(panel).getByRole("checkbox", { name: "Capture Gemini chats" })).toBeChecked();
  });

  it("copies the pairing string and confirms on the button", async () => {
    const user = userEvent.setup();
    const panel = await renderPanel();
    const pairing = pairingOf(panel);
    expect(pairing).toMatch(/^nm1:47831:[0-9a-f]{64}$/);

    await user.click(within(panel).getByRole("button", { name: "Copy" }));

    expect(await within(panel).findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(pairing);
  });

  it("regenerates the token after warning that the extension must be re-paired", async () => {
    const user = userEvent.setup();
    const panel = await renderPanel();
    const before = pairingOf(panel);
    const trigger = within(panel).getByRole("button", { name: "Regenerate…" });

    await user.click(trigger);
    const confirm = within(panel).getByRole("group", { name: /stops capturing until you paste the new pairing string/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(confirm).getByRole("button", { name: "Regenerate token" })).toHaveFocus();
    await user.click(within(confirm).getByRole("button", { name: "Regenerate token" }));

    expect(await within(panel).findByText(/New pairing string ready/)).toBeInTheDocument();
    expect(pairingOf(panel)).not.toBe(before);
    expect(pairingOf(panel)).toMatch(/^nm1:47831:/);
    expect(within(panel).queryByRole("group")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the new token when the panel is opened again", async () => {
    const user = userEvent.setup();
    const panel = await renderPanel();
    await user.click(within(panel).getByRole("button", { name: "Regenerate…" }));
    await user.click(within(panel).getByRole("button", { name: "Regenerate token" }));
    await within(panel).findByText(/New pairing string ready/);
    const regenerated = pairingOf(panel);

    const config = await mockTransport.invoke<{ pairing: string }>("get_capture_config", {});

    expect(config.pairing).toBe(regenerated);
  });

  it("cancels regenerating with Escape and keeps the token", async () => {
    const user = userEvent.setup();
    const panel = await renderPanel();
    const before = pairingOf(panel);
    await user.click(within(panel).getByRole("button", { name: "Regenerate…" }));

    await user.keyboard("{Escape}");

    expect(within(panel).queryByRole("group")).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Regenerate…" })).toHaveFocus();
    expect(pairingOf(panel)).toBe(before);
  });

  it("rejects a port outside 1024–65535 before saving", async () => {
    const user = userEvent.setup();
    const panel = await renderPanel();
    const port = within(panel).getByRole("spinbutton", { name: "Port" });

    await user.clear(port);
    await user.type(port, "80");

    expect(within(panel).getByText("Use a port from 1024 to 65535.")).toBeInTheDocument();
    expect(port).toHaveAttribute("aria-invalid", "true");
    expect(port).toHaveAccessibleDescription("Use a port from 1024 to 65535.");
    expect(within(panel).getByRole("button", { name: "Save port" })).toBeDisabled();
  });

  it("saves a new port, which changes the pairing string", async () => {
    const user = userEvent.setup();
    const panel = await renderPanel();
    const port = within(panel).getByRole("spinbutton", { name: "Port" });

    await user.clear(port);
    await user.type(port, "50000");
    await user.click(within(panel).getByRole("button", { name: "Save port" }));

    await waitFor(() => expect(pairingOf(panel)).toMatch(/^nm1:50000:/));
    expect(within(panel).getByRole("button", { name: "Save port" })).toBeDisabled();
  });

  it("shows the listener's error when the port is taken", async () => {
    await mockTransport.invoke("set_settings", { patch: { captureEnabled: true, capturePort: 8080 } });
    const panel = await renderPanel();

    expect(within(panel).getByText(/Port 8080 is in use/)).toHaveAttribute("data-ok", "false");
  });

  it("shows a friendly error when the backend rejects the port", async () => {
    setTransport({
      ...mockTransport,
      invoke: async (command, args) =>
        command === "set_settings"
          ? Promise.reject({ code: "invalid_input", message: "port out of range" })
          : mockTransport.invoke(command, args),
    });
    const user = userEvent.setup();
    const panel = await renderPanel();
    const port = within(panel).getByRole("spinbutton", { name: "Port" });

    await user.clear(port);
    await user.type(port, "50001");
    await user.click(within(panel).getByRole("button", { name: "Save port" }));

    expect(await within(panel).findByRole("alert")).toHaveTextContent(USER_MESSAGES.invalid_input);
  });

  it("says when the capture settings can't be read", async () => {
    setTransport({
      ...mockTransport,
      invoke: async (command, args) =>
        command === "get_capture_config"
          ? Promise.reject({ code: "secrets", message: "keyring locked" })
          : mockTransport.invoke(command, args),
    });
    renderWithProviders(<SettingsPage />);
    const panel = await screen.findByRole("region", { name: "Gemini live capture" });

    expect(await within(panel).findByRole("alert")).toHaveTextContent(USER_MESSAGES.secrets);
    expect(within(panel).queryByLabelText("Pairing string")).not.toBeInTheDocument();
  });
});
