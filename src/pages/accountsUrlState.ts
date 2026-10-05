import type { AccountsFilters } from "../services/accountsAdmin.api";

function choice(value: string | null, values: string[], fallback: string) {
  return value !== null && values.includes(value) ? value : fallback;
}
export function accountsFilters(params: URLSearchParams, search: string): AccountsFilters {
  const page = Number(params.get("page"));
  return {
    view: choice(params.get("view"), ["new", "staff", "farmers", "revoked", "all"], "new") as AccountsFilters["view"],
    role: choice(params.get("role"), ["all", "farmer", "field_reporter", "reviewer", "admin"], "all"),
    verification: choice(params.get("verification"), ["all", "verified", "unverified"], "all"),
    membership: choice(params.get("membership"), ["all", "not_issued", "active", "revoked"], "all"),
    sort: choice(params.get("sort"), ["newest", "oldest"], "newest"),
    per_page: params.get("per_page") === "50" ? 50 : 25,
    page: Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1, search,
  };
}
