import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("mock data mode", () => {
  it("shows the public landing page at / with a way into the workspace", async () => {
    vi.stubEnv("VITE_DATA_SOURCE", "mock");
    window.history.pushState({}, "", "/");
    const [{ AppProviders }, { default: App }] = await Promise.all([
      import("./app/AppProviders"),
      import("./App"),
    ]);

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Learn the cane. Keep the legacy growing.",
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
    expect(
      (await screen.findAllByRole("link", { name: "Open workspace" }))[0],
    ).toHaveAttribute("href", "/dashboard");
  });

  it("loads the dashboard as a protected route", async () => {
    vi.stubEnv("VITE_DATA_SOURCE", "mock");
    window.history.pushState({}, "", "/dashboard");
    const [{ AppProviders }, { default: App }] = await Promise.all([
      import("./app/AppProviders"),
      import("./App"),
    ]);

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(
      await screen.findByRole("heading", { name: "Home" }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/dashboard");
    expect(
      await screen.findByRole("link", { name: "Open CG-2026-0718" }),
    ).toBeInTheDocument();
  });

  it("loads the report queue and completes a review workflow", async () => {
    vi.stubEnv("VITE_DATA_SOURCE", "mock");
    window.history.pushState({}, "", "/reports");
    const [{ AppProviders }, { default: App }] = await Promise.all([
      import("./app/AppProviders"),
      import("./App"),
    ]);
    const user = userEvent.setup();

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(
      await screen.findByRole("heading", { name: "Recent cases" }),
    ).toBeInTheDocument();
    await user.click(
      await screen.findByRole("link", { name: "Open CG-2026-0718" }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "CG-2026-0718",
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", { name: "Provide Advisory or Assistance" }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    // Mock mode has no advisory library; record meaningful technical support.
    await user.click(screen.getByRole("radio", { name: "Technical Assistance" }));
    const review = screen.getByRole("form", { name: "Report Evidence Review" });
    await user.type(within(review).getByRole("textbox", { name: /Technical Assistance details/ }), "Demonstrated field sanitation and monitoring steps.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(within(review).getByRole("button", { name: "Next" }));
    await user.click(within(review).getByRole("button", { name: "Confirm decision" }));

    expect(await screen.findByText("CG-2026-0718 — Review confirmed.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "CG-2026-0718" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review Next Case" })).toBeInTheDocument();
    // The page back link and the save receipt both name where the reviewer came from.
    expect(screen.getAllByRole("link", { name: "Back to Cases" })).toHaveLength(2);
  });
});
