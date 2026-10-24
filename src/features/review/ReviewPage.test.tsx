import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockTransport } from "../../api/mock/mockTransport";
import { renderWorkspace } from "../../test/renderWorkspace";

/** Mock jobs tick through their stage in a couple of seconds. */
const JOB_WAIT = { timeout: 8000 };

function renderReview() {
  return renderWorkspace({ kind: "review" });
}

describe("ReviewPage (mock transport)", () => {
  it("opens on the week that just ended and explains what the test covers", async () => {
    renderReview();
    const weeks = await screen.findByRole("radiogroup", { name: "Week to review" });

    expect(within(weeks).getByRole("radio", { name: /Sep 21–27/ })).toHaveAttribute("aria-checked", "true");
    expect(within(weeks).getByRole("radio", { name: /This week.*Too little/ })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Sep 21–27" })).toBeInTheDocument();
    expect(screen.getByText(/Answer about 10 multiple-choice and 3 written questions/)).toBeInTheDocument();
    // The mock starts without an API key.
    expect(await screen.findByText(/needs your Anthropic API key/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start the test" })).toBeDisabled();
  });

  it("shows a graded week's study guide and links each section to its questions", async () => {
    const user = userEvent.setup();
    renderReview();

    await user.click(await screen.findByRole("radio", { name: /Sep 14–20.*Scored/ }));

    expect(await screen.findByRole("img", { name: /Score: \d+ percent/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How the week went" })).toBeInTheDocument();
    const study = screen.getByRole("region", { name: "What to study" });
    expect(within(study).getAllByText(/Review now|Refresh|Solid/).length).toBeGreaterThan(0);

    await user.click(within(study).getAllByRole("button", { name: /^question \d+$/ })[0]);
    const answers = await screen.findByRole("list", { name: "Your answers" });
    expect(within(answers).getAllByText(/Correct answer|Your answer/).length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: "Your answers" })).toHaveAttribute("aria-checked", "true");
  });

  it(
    "takes a test from first question to study guide",
    async () => {
      await mockTransport.invoke("set_api_key", { key: "sk-ant-test" });
      const user = userEvent.setup();
      renderReview();

      const start = await screen.findByRole("button", { name: "Start the test" });
      await waitFor(() => expect(start).toBeEnabled());
      await user.click(start);
      expect(await screen.findByText("Writing your test")).toBeInTheDocument();

      const first = await screen.findByRole("group", { name: /What happens when you call an async function/ }, JOB_WAIT);
      await user.click(within(first).getByText(/builds a future that does nothing/));
      expect(within(first).getByRole("radio", { name: /builds a future/ })).toBeChecked();
      expect(await screen.findByText("Saved")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Next →" }));
      await user.keyboard("a");
      expect(screen.getByRole("radio", { name: /Mutexes can't be created/ })).toBeChecked();
      expect(screen.getByRole("progressbar", { name: "Questions answered" })).toHaveAttribute("aria-valuenow", "2");

      // Leaving mid-test and coming back through Today keeps every answer.
      await user.click(screen.getByRole("button", { name: "Today" }));
      await user.click(await screen.findByRole("button", { name: "Continue" }));
      const resumed = await screen.findByRole("progressbar", { name: "Questions answered" });
      expect(resumed).toHaveAttribute("aria-valuenow", "2");
      await user.click(screen.getByRole("button", { name: /Question 2, multiple choice, answered/ }));
      expect(screen.getByRole("radio", { name: /Mutexes can't be created/ })).toBeChecked();

      await user.click(screen.getByRole("button", { name: /Question 11, written/ }));
      await user.type(screen.getByRole("textbox"), "Inrush current sags the shared power rail; add a capacitor.");

      await user.click(screen.getByRole("button", { name: "Hand in" }));
      const handIn = screen.getByRole("group", { name: "Ready to hand it in?" });
      expect(within(handIn).getByText(/3 of 11 answered/)).toBeInTheDocument();
      expect(within(handIn).getAllByRole("button", { name: /^Question \d+$/ })).toHaveLength(8);
      await user.click(within(handIn).getByRole("button", { name: "Hand in answers" }));

      expect(await screen.findByText("Grading your answers")).toBeInTheDocument();
      expect(await screen.findByRole("heading", { name: "How the week went" }, JOB_WAIT)).toBeInTheDocument();

      await user.click(screen.getByRole("radio", { name: "Your answers" }));
      const written = document.getElementById("answer-11");
      expect(written).not.toBeNull();
      expect(within(written as HTMLElement).getByText(/Inrush current sags/)).toBeInTheDocument();
      expect(within(written as HTMLElement).getAllByText("Made").length).toBe(2);
    },
    30_000,
  );
});
