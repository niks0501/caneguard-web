import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/ApiError";
import { useAuth } from "../../auth/useAuth";
import * as api from "../../services/accountsAdmin.api";
import { adminAccount } from "../../test/accountFixtures";
import { FieldAccountsSection } from "./FieldAccountsSection";

vi.mock("../../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../../services/accountsAdmin.api", async original => ({ ...await original<typeof api>(), listFieldAccounts: vi.fn(), changeFieldAccess: vi.fn() }));
const active: api.FieldAccount = { uuid: "00000000-0000-4000-8000-000000000301", name: "Field Sample", email: "field@example.test", role: "field_reporter", is_active: true, access_version: 3, membership_state: "active", allowed_actions: ["revoke", "replace"], denial_reasons: [] };
const disabled: api.FieldAccount = { ...active, is_active: false, access_version: 4, membership_state: "revoked", allowed_actions: ["restore"] };
const notIssued: api.FieldAccount = { ...active, uuid: "00000000-0000-4000-8000-000000000302", name: "Unassigned Sample", membership_state: "not_issued", allowed_actions: [], denial_reasons: ["Legacy or unsupported identity requires controlled operator reconciliation."] };
const unverified: api.FieldAccount = { ...disabled, uuid: "00000000-0000-4000-8000-000000000303", name: "Unverified Sample", allowed_actions: [], denial_reasons: ["Email not verified. Staff issuance is unavailable."] };
const meta = { page: 1, per_page: 25, total: 1 };
function renderSection() {
  return render(<QueryClientProvider client={new QueryClient()}><FieldAccountsSection /></QueryClientProvider>);
}
async function confirm(label: string, password = "synthetic-password") {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: label }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Office reference"), " REF-1 ");
  await user.type(within(dialog).getByLabelText("Your current password"), password);
  await user.click(within(dialog).getByRole("button", { name: /^Confirm/ }));
}
describe("Field accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: adminAccount, status: "authenticated", reason: null, restoreSession: vi.fn(), login: vi.fn(), logout: vi.fn() });
    vi.mocked(api.listFieldAccounts).mockResolvedValue({ data: [active], meta });
  });
  it("disables an active field account with the loaded access version", async () => {
    vi.mocked(api.changeFieldAccess).mockResolvedValue({ data: disabled });
    renderSection();
    expect(await screen.findByText("Active")).toBeInTheDocument();
    await confirm("Disable Field Sample");
    await waitFor(() => expect(api.changeFieldAccess).toHaveBeenCalledWith(active.uuid,
      expect.objectContaining({ operation: "revoke", role: "field_reporter", expected_access_version: 3, office_reference: " REF-1 ", idempotency_key: expect.any(String) }), "synthetic-password"));
    expect(await screen.findByText("Field Sample disabled.")).toBeInTheDocument();
  });
  it("re-enables a disabled field account", async () => {
    vi.mocked(api.listFieldAccounts).mockResolvedValue({ data: [disabled], meta });
    vi.mocked(api.changeFieldAccess).mockResolvedValue({ data: active });
    renderSection();
    expect(await screen.findByText("Disabled")).toBeInTheDocument();
    await confirm("Re-enable Field Sample");
    await waitFor(() => expect(api.changeFieldAccess).toHaveBeenCalledWith(active.uuid, expect.objectContaining({ operation: "restore", expected_access_version: 4 }), "synthetic-password"));
  });
  it("shows a wrong-password error in the dialog and keeps it open", async () => {
    vi.mocked(api.changeFieldAccess).mockRejectedValue(new ApiError("The current password is incorrect.", { status: 422 }));
    renderSection();
    await confirm("Disable Field Sample", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("The current password is incorrect.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("asks for a reload on a version conflict", async () => {
    vi.mocked(api.changeFieldAccess).mockRejectedValue(new ApiError("conflict", { status: 409 }));
    renderSection();
    await confirm("Disable Field Sample");
    expect(await screen.findByText(/Reload the list/)).toBeInTheDocument();
    expect(api.listFieldAccounts).toHaveBeenCalledTimes(2);
  });
  it("shows the server's reason instead of an action the access operation rejects", async () => {
    vi.mocked(api.listFieldAccounts).mockResolvedValue({ data: [notIssued, unverified], meta: { ...meta, total: 2 } });
    renderSection();
    expect(await screen.findByText("Legacy or unsupported identity requires controlled operator reconciliation.")).toBeInTheDocument();
    expect(screen.getByText("Email not verified. Staff issuance is unavailable.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disable Unassigned Sample" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-enable Unverified Sample" })).not.toBeInTheDocument();
  });
});
