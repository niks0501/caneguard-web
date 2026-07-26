import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("mock data mode", () => {
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
      await screen.findByRole("heading", { name: "Recent submissions" }),
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
      screen.getByRole("radio", { name: /Verified by staff/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Save review action" }),
    );

    expect(
      await screen.findByText("CG-2026-0718 was updated to Verified by staff."),
    ).toBeInTheDocument();
  });
});
