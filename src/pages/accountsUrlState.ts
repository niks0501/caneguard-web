import type { AccountsFilters } from "../services/accountsAdmin.api";

export function accountsFilters(params: URLSearchParams, search: string): AccountsFilters {
  const page = Number(params.get("page"));
  return { page: Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1, search };
}
