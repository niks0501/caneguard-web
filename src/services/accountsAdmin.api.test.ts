import { beforeEach, describe, expect, it, vi } from "vitest";
import { axiosClient } from "../api/axiosClient";
import { initializeCsrf } from "../auth/auth.api";
import { notifySessionExpired } from "../auth/authSession";
import { ApiError } from "../api/ApiError";
import fixture from "../../docs/contracts/examples/accounts-access-v1-list.json";
import { changeAccount, isSupportedAccount, listAccounts, listSchema } from "./accountsAdmin.api";
vi.mock("../api/axiosClient", () => ({ axiosClient: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
vi.mock("../auth/auth.api", () => ({ initializeCsrf: vi.fn() }));
vi.mock("../auth/authSession", () => ({ notifySessionExpired: vi.fn() }));
const filters = { view: "new" as const, search: "", role: "all", verification: "all", membership: "all", sort: "newest", page: 1, per_page: 25 };
describe("accounts contract transport", () => {
  beforeEach(() => vi.clearAllMocks());
  it("validates the list envelope and carries request cancellation", async () => {
    vi.mocked(axiosClient.get).mockResolvedValue({ data: fixture });
    const controller = new AbortController();
    expect((await listAccounts(filters, controller.signal)).data[0].email).toBe("alex@example.test");
    expect(axiosClient.get).toHaveBeenCalledWith("/api/v2/admin/accounts", { params: filters, signal: controller.signal });
  });
  it("rejects unknown response contracts and malformed versions; unknown states are read-only", () => {
    expect(() => listSchema.parse({ ...fixture, contract_version: "v99" })).toThrow();
    expect(() => listSchema.parse({ ...fixture, data: [{ ...fixture.data[0], access_version: 0 }] })).toThrow();
    const account = listSchema.parse(fixture).data[0];
    expect(isSupportedAccount({ ...account, membership_state: "invented" })).toBe(false);
    expect(isSupportedAccount({ ...account, origin: "invented" })).toBe(false);
    expect(isSupportedAccount({ ...account, stored_grants: ["*"] })).toBe(false);
  });
  it("clears the session on lost management authorization", async () => {
    vi.mocked(axiosClient.get).mockRejectedValue(new ApiError("lost key", { status: 403, code: "FORBIDDEN" }));
    await expect(listAccounts(filters)).rejects.toThrow("lost key");
    expect(notifySessionExpired).toHaveBeenCalledOnce();
  });
  it("uses the v2 existing access controller contract with CSRF, full keys and the same supplied operation key", async () => {
    const command = { operation: "admit" as const, expected_access_version: 1, desired: { role: "admin", grants: [] } };
    const data = listSchema.parse(fixture).data[0];
    vi.mocked(axiosClient.put).mockResolvedValue({ data: { contract_version: "accounts-access-v1", code: "ACCOUNT_ACCESS_UPDATED", data, access_version: 2, credentials_revoked: true, event_id: 1, operation_id: "00000000-0000-4000-8000-000000000301" } });
    await changeAccount(data.uuid, command, " REF ", "synthetic-password", "00000000-0000-4000-8000-000000000401");
    expect(initializeCsrf).toHaveBeenCalledOnce();
    expect(axiosClient.put).toHaveBeenCalledWith(`/api/v2/admin/accounts/${data.uuid}/access`, { ...command, contract_version: "accounts-access-v1", office_reference: "REF", current_password: "synthetic-password", idempotency_key: "00000000-0000-4000-8000-000000000401" });
  });
});
