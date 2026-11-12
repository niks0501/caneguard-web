import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("../pages/TodoPage", () => ({ TodoPage: () => <h1>To do page</h1> }));
vi.mock("../pages/SubmittedReportsPage", () => ({ SubmittedReportsPage: () => <h1>Reports page</h1> }));
vi.mock("../auth/RequireAuth", async () => {
  const { Outlet } = await import("react-router");
  return { RequireAuth: Outlet };
});
vi.mock("../auth/RequireWebRole", async () => {
  const { Outlet } = await import("react-router");
  return { RequireWebRole: Outlet };
});
vi.mock("../components/layout/AppShell", async () => {
  const { Outlet } = await import("react-router");
  return { AppShell: Outlet };
});

import { appRoutes } from "./appRoutes";

function renderAt(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("To do redirects", () => {
  it("sends /needs-assessment to /todo", async () => {
    const router = renderAt("/needs-assessment");
    expect(await screen.findByText("To do page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/todo");
  });

  it.each([
    ["needs_review", "#lane-review"],
    ["needs_visit", "#lane-send"],
    ["unverified_no_active_work", "#lane-send"],
    ["follow_up_due", "#lane-overdue"],
  ])("sends /reports?queue=%s to its lane", async (queue, hash) => {
    const router = renderAt(`/reports?queue=${queue}`);
    expect(await screen.findByText("To do page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/todo");
    expect(router.state.location.hash).toBe(hash);
  });

  it("keeps the plain Reports page", async () => {
    renderAt("/reports");
    expect(await screen.findByText("Reports page")).toBeInTheDocument();
  });
});
