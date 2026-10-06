import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth/useAuth";
import * as api from "../services/accountsAdmin.api";
import { adminAccount, webAccount } from "../test/accountFixtures";
import { AccountsPage } from "./AccountsPage";
import { accountsFilters } from "./accountsUrlState";

vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../services/accountsAdmin.api", async original => ({ ...await original<typeof api>(), listAccounts: vi.fn(), changeAccount: vi.fn() }));
function Location() { return <output aria-label="Location">{useLocation().search}</output>; }
function renderPage(route = "/accounts") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[route]}><AccountsPage /><Location /></MemoryRouter></QueryClientProvider>);
}
describe("User Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: adminAccount, status: "authenticated", reason: null, restoreSession: vi.fn(), login: vi.fn(), logout: vi.fn() });
    vi.mocked(api.listAccounts).mockResolvedValue({ data: [adminAccount, webAccount], meta: { page: 1, per_page: 25, total: 2 } });
  });
  it("shows only identity, web role and status; own row is disabled", async () => {
    renderPage();
    await screen.findByRole("link", { name: "Alex Sample" });
    expect(screen.getByRole("heading", { name: "User Management" })).toBeInTheDocument();
    expect(screen.getByLabelText("Role for Office Sample")).toBeDisabled();
    expect(screen.getByLabelText("Status for Office Sample")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save Changes for Office Sample" })).toBeDisabled();
    expect(screen.getByLabelText("Role for Alex Sample")).not.toBeDisabled();
    expect(screen.queryByText("District access")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map(node => node.textContent)).toEqual(["Name", "Email", "Role", "Status", "Action"]);
  });
  it("keeps search personal data out of URL state and debounces requests", async () => {
    const user = userEvent.setup();
    renderPage("/accounts?page=3&grants=anything");
    await screen.findByRole("link", { name: "Alex Sample" });
    await user.type(screen.getByLabelText("Search name or email"), "private@example.test");
    await waitFor(() => expect(api.listAccounts).toHaveBeenLastCalledWith({ page: 1, search: "private@example.test" }, expect.any(AbortSignal)));
    expect(screen.getByLabelText("Location")).not.toHaveTextContent("private@example.test");
  });
  it("distinguishes errors from empty results", async () => {
    vi.mocked(api.listAccounts).mockRejectedValue(new Error("offline"));
    renderPage();
    expect(await screen.findByText("Users could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("No web users.")).not.toBeInTheDocument();
  });
  it("validates page state and ignores retired authorization filters", () => {
    expect(accountsFilters(new URLSearchParams("page=-1&role=farmer&membership=active"), "")).toEqual({ page: 1, search: "" });
    expect(accountsFilters(new URLSearchParams("page=2"), "Alex")).toEqual({ page: 2, search: "Alex" });
  });
});
