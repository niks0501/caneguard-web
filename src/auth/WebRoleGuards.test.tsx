import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AuthContext } from "./auth.context";
import type { AppUser } from "./auth.types";
import { RequireAuth } from "./RequireAuth";
import { RequireAdmin } from "./RequireAdmin";
import { RequireWebRole } from "./RequireWebRole";
import { AppSidebar } from "../components/navigation/AppSidebar";
import { adminAccount } from "../test/accountFixtures";

function Shell() {
  const location = useLocation();
  return <><AppSidebar />{location.state?.notice ? <p role="status">{location.state.notice}</p> : null}<Outlet /></>;
}
function renderRoute(path: string, user: AppUser | null = { ...adminAccount, role: "reviewer" }) {
  return render(<AuthContext value={{ user, status: user ? "authenticated" : "unauthenticated", reason: null, login: vi.fn(), logout: vi.fn(), restoreSession: vi.fn() }}>
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="login" element={<h1>Sign in</h1>} />
        <Route element={<RequireAuth />}><Route element={<RequireWebRole />}><Route element={<Shell />}>
          <Route path="dashboard" element={<h1>Dashboard</h1>} />
          <Route path="reports" element={<h1>Reports</h1>} />
          <Route path="settings" element={<h1>Settings</h1>} />
          <Route element={<RequireAdmin />}>
            <Route path="accounts/*" element={<h1>Administrative page</h1>} />
            <Route path="report-approval" element={<h1>Administrative page</h1>} />
            <Route path="admin-settings" element={<h1>Administrative page</h1>} />
          </Route>
        </Route></Route></Route>
      </Routes>
    </MemoryRouter>
  </AuthContext>);
}

describe("role-only workspace guards", () => {
  it.each(["/accounts", "/accounts/user", "/report-approval", "/admin-settings"])("redirects reviewer deep link %s to Dashboard with notice", async path => {
    renderRoute(path);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("That section needs an Admin account.");
    expect(screen.queryByRole("heading", { name: "Administrative page" })).not.toBeInTheDocument();
    for (const label of ["User Management", "Report Approval", "Admin Settings"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });
  it.each(["/accounts", "/report-approval", "/admin-settings"])("allows Admin %s without capability or service flags", async path => {
    renderRoute(path, adminAccount);
    expect(await screen.findByRole("heading", { name: "Administrative page" })).toBeInTheDocument();
    for (const label of ["User Management", "Report Approval", "Admin Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });
  it.each(["/dashboard", "/reports", "/settings"])("allows reviewer operational route %s", async path => {
    renderRoute(path);
    for (const label of ["Home", "Reports", "Needs assessment", "Monitoring / Map", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("sends unauthenticated users to login before administrative content", async () => {
    renderRoute("/accounts", null);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Primary navigation")).not.toBeInTheDocument();
  });
  it("rejects an inactive frontend identity", async () => {
    renderRoute("/reports", { ...adminAccount, is_active: false });
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
