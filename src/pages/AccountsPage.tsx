import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { PageContent, PageHeader } from "../components/layout/Page";
import { LoadingState, ErrorState } from "../components/ui/States";
import { Pagination } from "../components/ui/Pagination";
import { Button } from "../components/ui/Button";
import { useAuth } from "../auth/useAuth";
import { routes } from "../app/routes";
import { formatDateTime } from "../lib/formatters";
import { accountsFilters } from "./accountsUrlState";
import { keyLabels, listAccounts, membershipLabels, roleLabels } from "../services/accountsAdmin.api";
import type { AccountKey } from "../services/accountsAdmin.api";

const views = { new: "New", staff: "Staff", farmers: "Farmers", revoked: "Revoked", all: "All accounts" } as const;

export function AccountsPage() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { document.title = "Accounts | CaneGuard"; }, []);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 300); return () => window.clearTimeout(timer); }, [search]);
  const filters = accountsFilters(params, debouncedSearch);
  const query = useQuery({ queryKey: ["accounts", auth.user?.uuid, filters], queryFn: ({ signal }) => listAccounts(filters, signal), retry: false, gcTime: 0 });
  function update(name: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete("search"); // Search PII never enters route state.
    next.set(name, value);
    if (name !== "page") next.set("page", "1");
    setParams(next);
  }
  const result = query.data;
  return (
    <PageContent className="accounts-page">
      <PageHeader title="Accounts" description={result?.meta.scope.district.name} />
      <nav className="accounts-views" aria-label="Account views">
        {Object.entries(views).map(([view, label]) => <button type="button" key={view} aria-current={filters.view === view ? "page" : undefined} onClick={() => update("view", view)}>
          {label} {result ? <span>{result.meta.counts[view as keyof typeof views]}</span> : null}
        </button>)}
      </nav>
      <div className="accounts-filters">
        <label className="settings-field"><span>Search name or email</span><input type="search" maxLength={160} value={search} onChange={event => { setSearch(event.target.value); update("page", "1"); }} /></label>
        <label className="settings-field"><span>Role</span><select value={filters.role} onChange={e => update("role", e.target.value)}><option value="all">All roles</option>{Object.entries(roleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
        <label className="settings-field"><span>Email</span><select value={filters.verification} onChange={e => update("verification", e.target.value)}><option value="all">All verification states</option><option value="verified">Verified</option><option value="unverified">Unverified</option></select></label>
        <label className="settings-field"><span>District access</span><select value={filters.membership} onChange={e => update("membership", e.target.value)}><option value="all">All access states</option>{Object.entries(membershipLabels).map(([state, label]) => <option key={state} value={state}>{label}</option>)}</select></label>
        <label className="settings-field"><span>Created</span><select value={filters.sort} onChange={e => update("sort", e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
        <label className="settings-field"><span>Rows per page</span><select value={filters.per_page} onChange={e => update("per_page", e.target.value)}><option value="25">25</option><option value="50">50</option></select></label>
      </div>
      {query.isPending ? <LoadingState message="Loading accounts…" /> : query.isError ? <ErrorState message="Accounts could not be loaded. No authority actions are available." onRetry={() => { void query.refetch(); void auth.restoreSession(); }} /> : result ? (
        <>
          <p className="accounts-scope">{result.meta.scope.scope}</p>
          {result.data.length === 0 ? <div className="accounts-empty" role="status">
            <h2>{search || filters.role !== "all" || filters.verification !== "all" || filters.membership !== "all" ? "No matching accounts." : filters.view === "new" ? "No new accounts to review." : "No accounts in this scope."}</h2>
            <Button variant="secondary" onClick={() => { setSearch(""); setParams({ view: "all" }); }}>Clear filters · All accounts</Button>
          </div> : <table role="table" className="report-table accounts-table"><caption className="sr-only">{views[filters.view]} in the authorized accounts scope</caption>
            <thead role="rowgroup"><tr role="row"><th scope="col">Account</th><th scope="col">Created</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">District access</th><th scope="col">Keys</th><th scope="col">Action</th></tr></thead>
            <tbody role="rowgroup">{result.data.map(account => <tr role="row" key={account.uuid}>
              <td data-label="Account"><strong>{account.name}</strong><span className="accounts-email">{account.email}</span></td>
              <td data-label={account.origin === "public_signup" ? "Signed up" : "Created"}>{formatDateTime(account.created_at)}</td>
              <td data-label="Email">{account.email_verified ? "Verified" : "Unverified"}</td>
              <td data-label="Role">{roleLabels[account.role] ?? `Unsupported: ${account.role}`}</td>
              <td data-label="District access">{membershipLabels[account.membership_state] ?? "Needs reconciliation"}</td>
              <td data-label="Keys">{account.effective_grants.map(key => keyLabels[key as AccountKey] ?? key).join(", ") || "None"}</td>
              <td data-label="Action"><Link className="accounts-open" to={routes.accountDetail(account.uuid)} aria-label={`Open account: ${account.name}, ${account.email}`}>{account.allowed_actions.includes("admit") ? "Review" : "Open"}</Link></td>
            </tr>)}</tbody>
          </table>}
          <Pagination currentPage={result.meta.page} pageCount={Math.max(1, Math.ceil(result.meta.filtered_total / result.meta.per_page))} itemCount={result.meta.filtered_total} itemLabel="accounts" onPageChange={page => update("page", String(page))} />
        </>
      ) : null}
    </PageContent>
  );
}
