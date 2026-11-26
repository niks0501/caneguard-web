import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import * as api from "../../services/accountsAdmin.api";
import { adminAccount } from "../../test/accountFixtures";
import { FarmerAccountsSection } from "./FarmerAccountsSection";

vi.mock("../../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../../services/accountsAdmin.api", async original => ({ ...await original<typeof api>(), listFarmerAccounts: vi.fn(), changeFarmerAccount: vi.fn(), resendFieldInvite: vi.fn() }));
const active: api.FarmerAccount = { uuid: "00000000-0000-4000-8000-000000000501", name: "Marites Dalisay", email: "marites@example.test", role: "farmer", is_active: true, access_version: 2, barangay: "Lumbangan", invite_pending: false, email_verified: true, status: "active", created_at: null };
const pending: api.FarmerAccount = { ...active, uuid: "00000000-0000-4000-8000-000000000502", name: "John Ley Vasquez", email: "john@example.test", barangay: null, invite_pending: true, email_verified: false, status: "invite_pending" };
const disabled: api.FarmerAccount = { ...active, uuid: "00000000-0000-4000-8000-000000000503", name: "Roberto Mendoza", is_active: false, access_version: 3, status: "disabled" };
const meta = { page: 1, per_page: 25, total: 3 };
function renderSection() {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><FarmerAccountsSection /></MemoryRouter></QueryClientProvider>);
}
describe("Farmer accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: adminAccount, status: "authenticated", reason: null, restoreSession: vi.fn(), login: vi.fn(), logout: vi.fn() });
    vi.mocked(api.listFarmerAccounts).mockResolvedValue({ data: [active, pending, disabled], meta });
  });
  it("lists farmers with their home barangay and status", async () => {
    renderSection();
    const table = await screen.findByRole("table", { name: "Farmer accounts" });
    expect(within(table).getAllByText("Lumbangan", { selector: "td" })).toHaveLength(2);
    expect(within(table).getByText("Not set")).toBeInTheDocument();
    expect(within(table).getByText("Invite pending")).toBeInTheDocument();
    expect(within(table).getByText("Disabled")).toBeInTheDocument();
  });
  it("filters by search, home barangay and status and returns to page one", async () => {
    renderSection();
    await screen.findByText("Marites Dalisay");
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Home barangay"), "Aga");
    await waitFor(() => expect(api.listFarmerAccounts).toHaveBeenLastCalledWith({ page: 1, search: "", barangay: "Aga", status: "" }, expect.anything()));
    await user.selectOptions(screen.getByLabelText("Account status"), "disabled");
    await waitFor(() => expect(api.listFarmerAccounts).toHaveBeenLastCalledWith({ page: 1, search: "", barangay: "Aga", status: "disabled" }, expect.anything()));
    await user.type(screen.getByLabelText("Search farmer accounts"), "mar");
    await waitFor(() => expect(api.listFarmerAccounts).toHaveBeenLastCalledWith({ page: 1, search: "mar", barangay: "Aga", status: "disabled" }, expect.anything()));
  });
  it("says when a filter matches nobody instead of claiming there are no farmers", async () => {
    vi.mocked(api.listFarmerAccounts).mockResolvedValue({ data: [], meta: { ...meta, total: 0 } });
    renderSection();
    expect(await screen.findByText("No farmer accounts.")).toBeInTheDocument();
    await userEvent.setup().selectOptions(screen.getByLabelText("Account status"), "active");
    expect(await screen.findByText("No matching farmer accounts.")).toBeInTheDocument();
  });
  it("offers a resend only while the invite is pending", async () => {
    vi.mocked(api.resendFieldInvite).mockResolvedValue({ invite_sent: true });
    renderSection();
    await screen.findByText("Marites Dalisay");
    expect(screen.queryByRole("button", { name: "Resend set-password link to Marites Dalisay" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Resend set-password link to John Ley Vasquez" }));
    expect(api.resendFieldInvite).toHaveBeenCalledWith(pending.uuid);
    expect(await screen.findByText("Set-password link sent.")).toBeInTheDocument();
  });
  it("disables an active farmer with the loaded access version", async () => {
    vi.mocked(api.changeFarmerAccount).mockResolvedValue({ data: { ...active, is_active: false, status: "disabled" } });
    renderSection();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Disable Marites Dalisay" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Scans already on their phone stay there/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Your current password"), "synthetic-password");
    await user.click(within(dialog).getByRole("button", { name: "Confirm disable" }));
    await waitFor(() => expect(api.changeFarmerAccount).toHaveBeenCalledWith(active.uuid, { is_active: false, expected_access_version: 2 }, "synthetic-password"));
    expect(await screen.findByText("Marites Dalisay disabled.")).toBeInTheDocument();
  });
  it("re-enables a disabled farmer", async () => {
    vi.mocked(api.changeFarmerAccount).mockResolvedValue({ data: { ...disabled, is_active: true, status: "active" } });
    renderSection();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Re-enable Roberto Mendoza" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your current password"), "synthetic-password");
    await user.click(within(dialog).getByRole("button", { name: "Confirm re-enable" }));
    await waitFor(() => expect(api.changeFarmerAccount).toHaveBeenCalledWith(disabled.uuid, { is_active: true, expected_access_version: 3 }, "synthetic-password"));
  });
  it("keeps the dialog open with the reason when the password is wrong", async () => {
    vi.mocked(api.changeFarmerAccount).mockRejectedValue(new ApiError("The given data was invalid.", { status: 422, errors: { current_password: ["The current password is incorrect."] } }));
    renderSection();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Disable Marites Dalisay" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Your current password"), "wrong");
    await user.click(within(dialog).getByRole("button", { name: "Confirm disable" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The current password is incorrect.");
  });
});
