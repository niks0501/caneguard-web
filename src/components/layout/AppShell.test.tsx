import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiConnectivityProvider } from "../../api/ApiConnectivityProvider";
import { AppShell } from "./AppShell";

vi.mock("../../auth/useAuth", () => ({
  useAuth: () => ({
    user: { name: "Maria Santos", role: "reviewer" },
    logout: vi.fn(),
  }),
}));

function renderShell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <ApiConnectivityProvider>
          <Routes>
            <Route element={<AppShell />} path="/">
              <Route element={<div>Workspace content</div>} index />
            </Route>
          </Routes>
        </ApiConnectivityProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppShell navigation drawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves focus into the drawer, traps Escape, and restores the trigger focus", async () => {
    const user = userEvent.setup();
    renderShell();

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(trigger);

    const closeButton = screen
      .getAllByRole("button", { name: "Close navigation" })
      .find((button) => button.classList.contains("mobile-drawer__close"));
    expect(closeButton).toBeDefined();
    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(
      within(screen.getByRole("dialog", { name: "Navigation menu" })).getByRole(
        "link",
        { name: "Home" },
      ),
    ).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("leaves Tab and Escape to a dialog opened from inside the drawer", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    const drawer = screen.getByRole("dialog", { name: "Navigation menu" });
    const signOutTrigger = within(drawer).getByRole("button", { name: /sign out/i });
    await user.click(signOutTrigger);

    const confirmation = screen.getByRole("dialog", { name: "Sign out?" });
    const cancel = within(confirmation).getByRole("button", { name: "Cancel" });

    await user.tab();
    expect(cancel).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Sign out?" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Navigation menu" })).toBeInTheDocument();
    expect(signOutTrigger).toHaveFocus();
  });

  it("hands the drawer keyboard back once the confirmation is dismissed", async () => {
    const user = userEvent.setup();
    renderShell();

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "Navigation menu" });
    await user.click(within(drawer).getByRole("button", { name: /sign out/i }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Sign out?" })).getByRole("button", {
        name: "Cancel",
      }),
    );

    expect(screen.queryByRole("dialog", { name: "Sign out?" })).not.toBeInTheDocument();

    // Escape closes the drawer again instead of being swallowed by a trap that
    // still believes a nested dialog is open.
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
