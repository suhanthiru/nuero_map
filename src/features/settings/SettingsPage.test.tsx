import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { USER_MESSAGES } from "../../api/errors";
import { renderWithProviders } from "../../test/renderWithProviders";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage (mock transport)", () => {
  it("saves a key without echoing it back, then tests it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    const input = await screen.findByLabelText("API key");

    await user.type(input, "sk-ant-api03-example-key-value");
    await user.click(screen.getByRole("button", { name: "Save to keychain" }));

    expect(await screen.findByText("A key is saved.")).toBeInTheDocument();
    expect(input).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Test key" }));
    expect(await screen.findByText("Key works.")).toHaveAttribute("role", "status");
  });

  it("shows a friendly error for a malformed key", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await user.type(await screen.findByLabelText("API key"), "sk-proj-nope");
    await user.click(screen.getByRole("button", { name: "Save to keychain" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(USER_MESSAGES.invalid_api_key);
  });

  it("previews retention for a new half-life and applies it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);
    const field = await screen.findByLabelText("Half-life in days");

    await user.clear(field);
    await user.type(field, "30");

    expect(screen.getByLabelText("Retention preview")).toHaveTextContent("idle 30d → 50%");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled());
  });

  it("switches the synthesis model", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await user.click(await screen.findByRole("radio", { name: "Sonnet 5 (cheaper)" }));

    await waitFor(() => expect(screen.getByRole("radio", { name: "Sonnet 5 (cheaper)" })).toHaveAttribute("aria-checked", "true"));
  });
});
