import type { Account } from "../services/accountsAdmin.api";

export const webAccount: Account = {
  uuid: "00000000-0000-4000-8000-000000000201", name: "Alex Sample",
  email: "alex@example.test", role: "reviewer", is_active: true, access_version: 1,
};
export const adminAccount: Account = {
  uuid: "00000000-0000-4000-8000-000000000101", name: "Office Sample",
  email: "office@example.test", role: "admin", is_active: true, access_version: 1,
};
