import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/ApiError";
import { useAuth } from "../auth/useAuth";
import * as api from "../services/accountsAdmin.api";
import listFixture from "../../docs/contracts/examples/accounts-access-v1-list.json";
import eventFixture from "../../docs/contracts/examples/account-access-event-v1.json";
import { AccountDetailPage } from "./AccountDetailPage";
import { RequireAccountsAccess } from "../auth/RequireAccountsAccess";
import { AppSidebar } from "../components/navigation/AppSidebar";
vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../services/accountsAdmin.api", async importOriginal => ({ ...await importOriginal<typeof api>(), getAccount: vi.fn(), getAccountEvents: vi.fn(), changeAccount: vi.fn() }));
const fixture = api.listSchema.parse(listFixture);
const account = fixture.data[0];
function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[`/accounts/${account.uuid}`]}><Routes><Route path="accounts/:uuid" element={<AccountDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
}
async function prepare(title = "Approve & assign") {
  const user = userEvent.setup();
  await screen.findByText("Current account");
  if (title === "Approve & assign") await user.selectOptions(screen.getByLabelText("Assign role"), "admin");
  await user.type(screen.getByLabelText("Office approval reference"), "SYNTHETIC-REF");
  await user.click(screen.getByRole("button", { name: title }));
  const modal = screen.getByRole("dialog");
  await user.type(within(modal).getByLabelText("Your current password"), "synthetic-password");
  return { user, modal };
}
describe("Account authority detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { uuid: "actor", name: "Office Sample", email: "office@example.test", role: "admin", capabilities: ["staff:manage"], accounts_enabled: true }, status: "authenticated", reason: null, restoreSession: vi.fn().mockResolvedValue(undefined), login: vi.fn(), logout: vi.fn() });
    vi.mocked(api.getAccount).mockResolvedValue({ contract_version: "accounts-access-v1", data: account, policy: fixture.meta.scope });
    vi.mocked(api.getAccountEvents).mockResolvedValue({ contract_version: "accounts-access-v1", data: [], meta: { page: 1, per_page: 25, total: 0, history_completeness: "since_registration" } });
    vi.mocked(api.changeAccount).mockResolvedValue({ contract_version: "accounts-access-v1", code: "ACCOUNT_ACCESS_UPDATED", data: account, event_id: 1, operation_id: eventFixture.operation_id, access_version: 2, credentials_revoked: true });
  });
  it("starts every new staff key unchecked and submits one reviewed complete grant set with step-up", async () => {
    renderPage();
    const { user, modal } = await prepare();
    for (const checkbox of screen.getAllByRole("checkbox")) expect(checkbox).not.toBeChecked();
    expect(within(modal).getByText("Confirmed keys")).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Confirm approve & assign" }));
    await waitFor(() => expect(api.changeAccount).toHaveBeenCalledWith(account.uuid, { operation: "admit", expected_access_version: 1, desired: { role: "admin", grants: [] } }, "SYNTHETIC-REF", "synthetic-password", expect.any(String)));
    expect(await screen.findByText("Change saved.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("requires an office reference and clears the password on cancel with focus restoration", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Current account");
    await user.selectOptions(screen.getByLabelText("Assign role"), "admin");
    await user.click(screen.getByRole("button", { name: "Approve & assign" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a non-secret office approval reference.");
    const prepared = await prepare();
    await prepared.user.click(within(prepared.modal).getByRole("button", { name: "Cancel" }));
    expect(api.changeAccount).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Approve & assign" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Approve & assign" }));
    expect(screen.getByLabelText("Your current password")).toHaveValue("");
  });
  it("keeps triage separate from authority and leaves unverified farmers triageable but never staff-assignable", async () => {
    vi.mocked(api.getAccount).mockResolvedValue({ contract_version: "accounts-access-v1", data: { ...account, email_verified: false, allowed_actions: ["keep_farmer", "defer", "reopen"], denial_reasons: ["Email not verified."] }, policy: fixture.meta.scope });
    renderPage();
    const { user, modal } = await prepare("Keep as farmer");
    expect(screen.queryByLabelText("Assign role")).not.toBeInTheDocument();
    expect(within(modal).getByText(/Triage only/)).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Confirm keep as farmer" }));
    await waitFor(() => expect(api.changeAccount).toHaveBeenCalledWith(account.uuid, { disposition: "keep_farmer", expected_access_version: 1 }, "SYNTHETIC-REF", "synthetic-password", expect.any(String)));
  });
  it("clears password and associates wrong-password feedback without losing the proposed change", async () => {
    vi.mocked(api.changeAccount).mockRejectedValue(new ApiError("The current password is incorrect.", { status: 422, code: "STEP_UP_REQUIRED" }));
    renderPage();
    const { user, modal } = await prepare();
    await user.click(within(modal).getByRole("button", { name: "Confirm approve & assign" }));
    await waitFor(() => expect(screen.getByLabelText("Your current password")).toHaveValue(""));
    expect(screen.getByRole("alert")).toHaveTextContent("The current password is incorrect.");
    expect(screen.getByLabelText("Your current password")).toHaveAttribute("aria-describedby", "account-submit-error");
    expect(screen.getByLabelText("Assign role")).toHaveValue("admin");
  });
  it("reloads version conflicts and requires fresh selection rather than silently merging stale keys", async () => {
    vi.mocked(api.changeAccount).mockRejectedValue(new ApiError("Authority changed.", { status: 409, code: "ACCESS_VERSION_CONFLICT" }));
    renderPage();
    const { user, modal } = await prepare();
    vi.mocked(api.getAccount).mockResolvedValue({ contract_version: "accounts-access-v1", data: { ...account, access_version: 2 }, policy: fixture.meta.scope });
    await user.click(within(modal).getByRole("button", { name: "Confirm approve & assign" }));
    expect(await screen.findByText(/Reloaded authority must be reviewed/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Assign role")).toHaveValue(""));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("checks an uncertain outcome then retries the same key with a fresh password, never a new authority command", async () => {
    vi.mocked(api.changeAccount).mockRejectedValueOnce(new ApiError("timeout"));
    renderPage();
    const { user, modal } = await prepare();
    await user.click(within(modal).getByRole("button", { name: "Confirm approve & assign" }));
    expect(await screen.findByText(/Outcome not confirmed/)).toBeInTheDocument();
    const operationKey = vi.mocked(api.changeAccount).mock.calls[0][4];
    expect(screen.getByRole("button", { name: "Confirm approve & assign" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Check current details and history" }));
    await waitFor(() => expect(screen.getByLabelText("Your current password")).not.toBeDisabled());
    await user.type(screen.getByLabelText("Your current password"), "fresh-password");
    await user.click(screen.getByRole("button", { name: "Confirm approve & assign" }));
    await waitFor(() => expect(api.changeAccount).toHaveBeenLastCalledWith(account.uuid, expect.any(Object), "SYNTHETIC-REF", "fresh-password", operationKey));
  });
  it("reports saved-but-refetch-failed honestly instead of inviting a second write", async () => {
    renderPage();
    const { user, modal } = await prepare();
    vi.mocked(api.getAccount).mockRejectedValue(new ApiError("offline"));
    await user.click(within(modal).getByRole("button", { name: "Confirm approve & assign" }));
    expect(await screen.findByText("Change saved. Refresh to load current details.")).toBeInTheDocument();
    expect(api.changeAccount).toHaveBeenCalledTimes(1);
  });
  it("keeps unsupported enums read-only even if malformed server hints offer mutation actions", async () => {
    vi.mocked(api.getAccount).mockResolvedValue({ contract_version: "accounts-access-v1", data: { ...account, role: "expert" }, policy: fixture.meta.scope });
    renderPage();
    expect(await screen.findByText(/Unsupported account state/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve & assign" })).not.toBeInTheDocument();
  });
  it("does not turn a history error into empty history and renders durable actor/reference/version evidence", async () => {
    vi.mocked(api.getAccountEvents).mockRejectedValueOnce(new ApiError("history unavailable"));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Access history could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("No recorded access decisions.")).not.toBeInTheDocument();
    vi.mocked(api.getAccountEvents).mockResolvedValue({ contract_version: "accounts-access-v1", data: [api.eventSchema.parse(eventFixture)], meta: { page: 1, per_page: 25, total: 1, history_completeness: "earlier_history_unavailable" } });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Earlier grant history unavailable.")).toBeInTheDocument();
    expect(screen.getByText(/Office Sample · SYNTHETIC-OFFICE-DECISION/)).toBeInTheDocument();
    expect(screen.getByText(/account-access-event-v1/)).toBeInTheDocument();
  });
  it("shows transfer instead of allowing a second approver and previews both identities", async () => {
    vi.mocked(api.getAccount).mockResolvedValue({ contract_version: "accounts-access-v1", data: { ...account, role: "admin", membership_state: "active", allowed_actions: ["replace", "revoke", "transfer"] }, policy: { ...fixture.meta.scope, approver: { uuid: eventFixture.actor.uuid, name: "Departing Sample", access_version: 5 }, transfer_available: true } });
    renderPage();
    const { modal } = await prepare("Transfer approval key");
    expect(screen.getByRole("checkbox", { name: "Approve reports" })).toBeDisabled();
    expect(within(modal).getByText(/Move Approve reports from Departing Sample/)).toBeInTheDocument();
  });
  it("capability-gates administration navigation and deep links, not merely the admin role", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uuid: "actor", name: "Office Sample", email: "office@example.test", role: "admin", capabilities: [], accounts_enabled: true }, status: "authenticated", reason: null, restoreSession: vi.fn(), login: vi.fn(), logout: vi.fn() });
    render(<MemoryRouter><AppSidebar /><RequireAccountsAccess /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "Accounts" })).not.toBeInTheDocument();
    expect(screen.getByText(/requires a current Manage staff key/)).toBeInTheDocument();
  });
});
