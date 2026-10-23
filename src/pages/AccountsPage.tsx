import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageContent, PageHeader } from "../components/layout/Page";
import { AccountAccessTable } from "../components/accounts/AccountAccessTable";
import { LoadingState, ErrorState } from "../components/ui/States";
import { Pagination } from "../components/ui/Pagination";
import { useAuth } from "../auth/useAuth";
import { accountsFilters } from "./accountsUrlState";
import { listAccounts } from "../services/accountsAdmin.api";

export function AccountsPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { document.title = "User Management | CaneGuard"; }, []);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search), 300); return () => window.clearTimeout(timer); }, [search]);
  const filters = accountsFilters(params, debouncedSearch);
  const query = useQuery({ queryKey: ["accounts", user?.uuid, filters], queryFn: ({ signal }) => listAccounts(filters, signal), retry: false, gcTime: 0 });
  const result = query.data;
  return <PageContent className="accounts-page">
    <PageHeader title="User Management" />
    <section className="accounts-provisioning" aria-labelledby="accounts-provisioning-heading">
      <h2 id="accounts-provisioning-heading">New office accounts</h2>
      <p>
        This screen changes the role or status of an existing Web user. It does not
        create accounts and there is no self-service staff sign-up.
      </p>
      <p>
        A new Reviewer or Admin account is issued by an authorized CaneGuard operator.
        Send the person&apos;s full name, work email, required role and the office
        reference for the request through the district office&rsquo;s approved access
        request channel. The account is verified and provisioned before the person
        signs in here.
      </p>
    </section>
    <div className="accounts-filters">
      <label className="settings-field"><span>Search name or email</span><input type="search" maxLength={160} value={search} onChange={event => { setSearch(event.target.value); setParams({ page: "1" }); }} /></label>
    </div>
    {query.isPending ? <LoadingState message="Loading users…" /> : query.isError ? <ErrorState message="Users could not be loaded." onRetry={() => void query.refetch()} /> : result ? <>
      {result.data.length === 0 ? <p role="status">{search ? "No matching users." : "No web users."}</p> : <AccountAccessTable accounts={result.data} onSaved={async () => { await client.invalidateQueries({ queryKey: ["accounts"] }); }} />}
      <Pagination currentPage={result.meta.page} pageCount={Math.max(1, Math.ceil(result.meta.total / result.meta.per_page))} itemCount={result.meta.total} itemLabel="users" onPageChange={page => setParams({ page: String(page) })} />
    </> : null}
  </PageContent>;
}
