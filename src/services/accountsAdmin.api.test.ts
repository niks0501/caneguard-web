import { beforeEach, describe, expect, it, vi } from "vitest";
import { axiosClient } from "../api/axiosClient";
import { initializeCsrf } from "../auth/auth.api";
import { webAccount } from "../test/accountFixtures";
import { changeAccount, listAccounts, listSchema } from "./accountsAdmin.api";

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
  it("sends the v2 access operation with step-up, reference, key and version", async () => {
    const { changeFieldAccess } = await import("./accountsAdmin.api");
    const field = { ...webAccount, role: "field_reporter" as const };
    vi.mocked(axiosClient.put).mockResolvedValue({ data: { data: field } });
    await changeFieldAccess(field.uuid, { operation: "revoke", role: "field_reporter", expected_access_version: 2, office_reference: " REF ", idempotency_key: "key" }, "pw");
    expect(initializeCsrf).toHaveBeenCalled();
    expect(axiosClient.put).toHaveBeenCalledWith(`/api/v2/admin/accounts/${field.uuid}/access`, {
      contract_version: "accounts-access-v1", operation: "revoke", desired: { role: "field_reporter", grants: [] },
      current_password: "pw", office_reference: "REF", idempotency_key: "key", expected_access_version: 2,
    });
  });
});
