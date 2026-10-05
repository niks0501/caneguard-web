import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../auth/useAuth";
import * as api from "../services/accountsAdmin.api";
import fixture from "../../docs/contracts/examples/accounts-access-v1-list.json";
import { AccountsPage } from "./AccountsPage";
import { accountsFilters } from "./accountsUrlState";
vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../services/accountsAdmin.api", async importOriginal => ({ ...await importOriginal<typeof api>(), listAccounts: vi.fn() }));
function Location() { return <output aria-label="Route">{useLocation().search}</output>; }
function renderPage(route = "/accounts") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[route]}><AccountsPage /><Location /></MemoryRouter></QueryClientProvider>);
}
describe("Accounts inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { uuid: "actor", name: "Office Sample", email: "office@example.test", role: "admin", capabilities: ["staff:manage"], accounts_enabled: true }, status: "authenticated", reason: null, restoreSession: vi.fn(), login: vi.fn(), logout: vi.fn() });
    vi.mocked(api.listAccounts).mockResolvedValue(api.listSchema.parse(fixture));
  });
  it("shows honest scoped counts, identity, verification, role, keys and a UUID detail link", async () => {
    renderPage();
    expect(await screen.findByText("Alex Sample")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New 1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Open account: Alex Sample/ })).toHaveAttribute("href", "/accounts/00000000-0000-4000-8000-000000000201");
    expect(screen.getByText(/single-pilot global inbox/)).toBeInTheDocument();
    expect(screen.getByText(/AM/)).toBeInTheDocument();
  });
  it("sends all filters and pagination to the server, while keeping debounced search PII out of the URL", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Alex Sample");
    await user.click(screen.getByRole("button", { name: "Staff 0" }));
    await user.selectOptions(screen.getByLabelText("Role"), "admin");
    await user.selectOptions(screen.getByLabelText("Email"), "verified");
    await user.selectOptions(screen.getByLabelText("District access"), "active");
    await user.selectOptions(screen.getByLabelText("Created"), "oldest");
    await user.selectOptions(screen.getByLabelText("Rows per page"), "50");
    await user.type(screen.getByLabelText("Search name or email"), "private@example.test");
    await waitFor(() => expect(api.listAccounts).toHaveBeenLastCalledWith(expect.objectContaining({ view: "staff", role: "admin", verification: "verified", membership: "active", sort: "oldest", per_page: 50, page: 1, search: "private@example.test" }), expect.any(AbortSignal)));
    expect(screen.getByLabelText("Route").textContent).not.toContain("private");
    expect(window.localStorage.length).toBe(0);
  });
  it("does not show fake zero counts on loading and treats network failure as error, not empty", async () => {
    vi.mocked(api.listAccounts).mockRejectedValue(new Error("offline"));
    renderPage();
    expect(screen.getByText("Loading accounts…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New 0" })).not.toBeInTheDocument();
    expect(await screen.findByText(/Accounts could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText("No new accounts to review.")).not.toBeInTheDocument();
  });
  it("keeps an empty newcomer inbox distinct from an empty database and exposes All accounts", async () => {
    vi.mocked(api.listAccounts).mockResolvedValue({ ...api.listSchema.parse(fixture), data: [] });
    renderPage();
    expect(await screen.findByText("No new accounts to review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters · All accounts" })).toBeInTheDocument();
  });
  it("validates URL state and never restores search from it", () => {
    expect(accountsFilters(new URLSearchParams("view=unknown&role=expert&page=-1&per_page=999&search=secret"), "")).toEqual({ view: "new", role: "all", verification: "all", membership: "all", sort: "newest", page: 1, per_page: 25, search: "" });
  });
});
