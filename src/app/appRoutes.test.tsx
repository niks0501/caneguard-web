import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

vi.mock("../pages/TodoPage", () => ({ TodoPage: () => <h1>To do page</h1> }));
vi.mock("../pages/SubmittedReportsPage", () => ({ SubmittedReportsPage: () => <h1>Reports page</h1> }));
vi.mock("../pages/MonitoringWorkspacePage", () => ({ MonitoringWorkspacePage: () => <h1>Field visits page</h1> }));
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

  it("keeps queue filters on the Reports page", async () => {
    const router = renderAt("/reports?queue=needs_visit&search=orchard");
    expect(await screen.findByText("Reports page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/reports");
    expect(router.state.location.search).toBe("?queue=needs_visit&search=orchard");
  });
});

describe("Field visits map redirect", () => {
  it("sends /map to the Map view of Field visits and keeps its filters", async () => {
    const router = renderAt("/map?queue=needs_visit&barangay=Poblacion");
    expect(await screen.findByText("Field visits page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/monitoring");
    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("view")).toBe("map");
    expect(params.get("queue")).toBe("needs_visit");
    expect(params.get("barangay")).toBe("Poblacion");
  });
});
