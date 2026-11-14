import { beforeEach, describe, expect, it, vi } from "vitest";
import { axiosClient } from "../api/axiosClient";
import { initializeCsrf } from "../auth/auth.api";
import { webAccount } from "../test/accountFixtures";
import { changeAccount, listAccounts, listSchema } from "./accountsAdmin.api";
import type { FieldAccount } from "./accountsAdmin.api";

vi.mock("../api/axiosClient", () => ({ axiosClient: { get: vi.fn(), patch: vi.fn(), put: vi.fn() } }));
vi.mock("../auth/auth.api", () => ({ initializeCsrf: vi.fn() }));
const filters = { search: "", page: 1 };
const fixture = { data: [webAccount], meta: { page: 1, per_page: 25, total: 1 } };
describe("simplified account transport", () => {
  beforeEach(() => vi.clearAllMocks());
  it("validates role/status data and preserves cancellation", async () => {
    vi.mocked(axiosClient.get).mockResolvedValue({ data: fixture });
    const controller = new AbortController();
    expect((await listAccounts(filters, controller.signal)).data[0].email).toBe("alex@example.test");
    expect(axiosClient.get).toHaveBeenCalledWith("/api/v1/admin/accounts", { params: filters, signal: controller.signal });
  });
  it("rejects unknown roles, malformed status and invalid versions", () => {
    for (const change of [{ role: "farmer" }, { is_active: "yes" }, { access_version: 0 }]) {
      expect(() => listSchema.parse({ ...fixture, data: [{ ...webAccount, ...change }] })).toThrow();
    }
  });
  it("sends only role/status and step-up to the supported API with CSRF", async () => {
    const command = { role: "admin" as const, is_active: false, expected_access_version: 1 };
    vi.mocked(axiosClient.patch).mockResolvedValue({ data: { data: webAccount } });
    await changeAccount(webAccount.uuid, command, "synthetic-password");
    expect(initializeCsrf).toHaveBeenCalledOnce();
    expect(axiosClient.patch).toHaveBeenCalledWith(`/api/v1/admin/accounts/${webAccount.uuid}`, { ...command, current_password: "synthetic-password" });
  });
});

describe("field account transport", () => {
  beforeEach(() => vi.clearAllMocks());
  it("sends the v2 access operation with step-up, reference, key and version", async () => {
    const { changeFieldAccess } = await import("./accountsAdmin.api");
    const field: FieldAccount = { ...webAccount, role: "field_reporter", is_active: false, membership_state: "revoked", allowed_actions: ["restore"], denial_reasons: [] };
    vi.mocked(axiosClient.put).mockResolvedValue({ data: { data: field } });
    await changeFieldAccess(field.uuid, { operation: "revoke", role: "field_reporter", expected_access_version: 2, office_reference: " REF ", idempotency_key: "key" }, "pw");
    expect(initializeCsrf).toHaveBeenCalled();
    expect(axiosClient.put).toHaveBeenCalledWith(`/api/v2/admin/accounts/${field.uuid}/access`, {
      contract_version: "accounts-access-v1", operation: "revoke", desired: { role: "field_reporter", grants: [] },
      current_password: "pw", office_reference: "REF", idempotency_key: "key", expected_access_version: 2,
    });
  });
  it("accepts the base account the access operation returns after an admission", async () => {
    const { changeFieldAccess } = await import("./accountsAdmin.api");
    const saved = { ...webAccount, role: "field_reporter" as const, access_version: 3 };
    vi.mocked(axiosClient.put).mockResolvedValue({ data: { contract_version: "accounts-access-v1", code: "ACCOUNT_ACCESS_UPDATED", data: saved, event_id: 1, operation_id: "op", access_version: 3, credentials_revoked: false } });
    await expect(changeFieldAccess(saved.uuid, { operation: "admit", role: "field_reporter", expected_access_version: 2, office_reference: "REF", idempotency_key: "key" }, "pw")).resolves.toEqual({ data: saved });
    expect(axiosClient.put).toHaveBeenCalledWith(`/api/v2/admin/accounts/${saved.uuid}/access`, expect.objectContaining({ operation: "admit", desired: { role: "field_reporter", grants: [] } }));
  });
});
