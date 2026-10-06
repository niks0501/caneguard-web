import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { useAuth } from "../auth/useAuth";
import * as api from "../services/accountsAdmin.api";
import { adminAccount, webAccount } from "../test/accountFixtures";
import { AccountDetailPage } from "./AccountDetailPage";

vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../services/accountsAdmin.api", async original => ({ ...await original<typeof api>(), getAccount: vi.fn(), getAccountEvents: vi.fn(), changeAccount: vi.fn() }));
function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[`/accounts/${webAccount.uuid}`]}><Routes><Route path="accounts/:uuid" element={<AccountDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
}
async function prepare() {
  const user = userEvent.setup();
  await screen.findByLabelText("Role for Alex Sample");
  await user.selectOptions(screen.getByLabelText("Role for Alex Sample"), "admin");
  await user.selectOptions(screen.getByLabelText("Status for Alex Sample"), "disabled");
  await user.click(screen.getByRole("button", { name: "Save Changes for Alex Sample" }));
  const modal = screen.getByRole("dialog");
  await user.type(within(modal).getByLabelText("Your current password"), "synthetic-password");
  return { user, modal };
}
describe("Account role/status detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: adminAccount, status: "authenticated", reason: null, restoreSession: vi.fn(), login: vi.fn(), logout: vi.fn() });
    vi.mocked(api.getAccount).mockResolvedValue({ data: webAccount });
    vi.mocked(api.getAccountEvents).mockResolvedValue({ data: [] });
    vi.mocked(api.changeAccount).mockResolvedValue({ data: { ...webAccount, role: "admin", is_active: false, access_version: 2 } });
  });
  it("confirms role and status with password before writing and refreshes per-user history", async () => {
    renderPage();
    const { user, modal } = await prepare();
    expect(within(modal).getByText(/Reviewer → Admin/)).toHaveTextContent("Active → Disabled");
    expect(api.changeAccount).not.toHaveBeenCalled();
    await user.click(within(modal).getByRole("button", { name: "Confirm changes" }));
    await waitFor(() => expect(api.changeAccount).toHaveBeenCalledWith(webAccount.uuid, { role: "admin", is_active: false, expected_access_version: 1 }, "synthetic-password"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(api.getAccountEvents).toHaveBeenCalledTimes(2));
  });
  it("clears password on cancel and restores focus to Save Changes", async () => {
    renderPage();
    const { user, modal } = await prepare();
    await user.click(within(modal).getByRole("button", { name: "Cancel" }));
    expect(api.changeAccount).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save Changes for Alex Sample" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Save Changes for Alex Sample" }));
    expect(screen.getByLabelText("Your current password")).toHaveValue("");
  });
  it("associates password errors and clears the rejected password", async () => {
    vi.mocked(api.changeAccount).mockRejectedValue(new ApiError("The current password is incorrect.", { status: 422 }));
    renderPage();
    const { user, modal } = await prepare();
    await user.click(within(modal).getByRole("button", { name: "Confirm changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The current password is incorrect.");
    expect(screen.getByLabelText("Your current password")).toHaveValue("");
    expect(screen.getByLabelText("Your current password")).toHaveAttribute("aria-describedby", `account-${webAccount.uuid}-error`);
  });
  it("does not silently merge stale writes after a conflict", async () => {
    vi.mocked(api.changeAccount).mockRejectedValue(new ApiError("Changed", { status: 409 }));
    renderPage();
    const { user, modal } = await prepare();
    vi.mocked(api.getAccount).mockResolvedValue({ data: { ...webAccount, access_version: 2 } });
    await user.click(within(modal).getByRole("button", { name: "Confirm changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByLabelText("Role for Alex Sample")).toHaveValue("reviewer"));
    expect(api.changeAccount).toHaveBeenCalledTimes(1);
  });
  it("renders role/status history without authorization machinery", async () => {
    vi.mocked(api.getAccountEvents).mockResolvedValue({ data: [{ id: 1, action: "account_status_change", outcome: "success", actor_name: "Office Sample", created_at: "2026-10-06T04:00:00Z", before: { role: "reviewer", is_active: true }, after: { role: "reviewer", is_active: false } }] });
    renderPage();
    expect(await screen.findByText(/Active → Disabled/)).toBeInTheDocument();
    expect(screen.getByText("Office Sample · success")).toBeInTheDocument();
    expect(screen.getByText(/12:00 PM/)).toBeInTheDocument();
    expect(screen.queryByText(/Grant|Keys|district/)).not.toBeInTheDocument();
  });
  it("does not turn a history failure into empty history", async () => {
    vi.mocked(api.getAccountEvents).mockRejectedValue(new ApiError("offline"));
    renderPage();
    expect(await screen.findByText("Account history could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("No recorded account changes.")).not.toBeInTheDocument();
  });
});
