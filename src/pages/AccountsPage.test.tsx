import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { useAuth } from "../auth/useAuth";
import * as api from "../services/accountsAdmin.api";
import { adminAccount, webAccount } from "../test/accountFixtures";
import { AccountsPage } from "./AccountsPage";
import { accountsFilters } from "./accountsUrlState";

vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../services/accountsAdmin.api", async original => ({ ...await original<typeof api>(), listAccounts: vi.fn(), changeAccount: vi.fn(), createAccount: vi.fn(), listFieldAccounts: vi.fn(), changeFieldAccess: vi.fn() }));
function Location() { return <output aria-label="Location">{useLocation().search}</output>; }
function renderPage(route = "/accounts") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[route]}><AccountsPage /><Location /></MemoryRouter></QueryClientProvider>);
}
describe("User Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: adminAccount, status: "authenticated", reason: null, restoreSession: vi.fn(), login: vi.fn(), logout: vi.fn() });
    vi.mocked(api.listFieldAccounts).mockResolvedValue({ data: [], meta: { page: 1, per_page: 25, total: 0 } });
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
  it("offers Add account, submits once with step-up, and Cancel sends nothing", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createAccount).mockResolvedValue({ data: { uuid: webAccount.uuid, name: "New Person", email: "new@example.test", role: "reviewer" }, invite_sent: true });
    renderPage();
    await screen.findByRole("link", { name: "Alex Sample" });
    expect(screen.queryByText(/does not\s+create accounts/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add account" }));
    const dialog = await screen.findByRole("dialog", { name: "Add account" });
    expect(within(dialog).getAllByRole("option").map(node => node.textContent)).toEqual(["Field reporter", "Reviewer", "Admin"]);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.createAccount).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Add account" }));
    const open = await screen.findByRole("dialog", { name: "Add account" });
    await user.type(within(open).getByLabelText("Full name"), "New Person");
    await user.type(within(open).getByLabelText("Work email"), "new@example.test");
    await user.selectOptions(within(open).getByLabelText("Role"), "field_reporter");
    await user.type(within(open).getByLabelText("Your current password"), "synthetic");
    await user.dblClick(within(open).getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(api.createAccount).toHaveBeenCalledTimes(1));
    expect(api.createAccount).toHaveBeenCalledWith({ name: "New Person", email: "new@example.test", role: "field_reporter" }, "synthetic");
    expect(await screen.findByText(/set-password link was emailed to new@example.test/)).toBeInTheDocument();
  });

  it("shows server validation errors in the dialog and keeps it open", async () => {
    const user = userEvent.setup();
    vi.mocked(api.createAccount).mockRejectedValue(new ApiError("Invalid", { status: 422, errors: { email: ["The email has already been taken."] } }));
    renderPage();
    await screen.findByRole("link", { name: "Alex Sample" });
    await user.click(screen.getByRole("button", { name: "Add account" }));
    const dialog = await screen.findByRole("dialog", { name: "Add account" });
    await user.type(within(dialog).getByLabelText("Full name"), "Dup");
    await user.type(within(dialog).getByLabelText("Work email"), "dup@example.test");
    await user.type(within(dialog).getByLabelText("Your current password"), "synthetic");
    await user.click(within(dialog).getByRole("button", { name: "Create account" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The email has already been taken.");
    expect(within(dialog).getByLabelText("Your current password")).toHaveValue("");
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
