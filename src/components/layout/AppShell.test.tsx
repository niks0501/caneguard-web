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
        { name: "Overview" },
      ),
    ).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
