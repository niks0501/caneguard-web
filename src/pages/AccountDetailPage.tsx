import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/useAuth";
import { routes } from "../app/routes";
import { PageContent, PageHeader } from "../components/layout/Page";
import { AccountAccessTable } from "../components/accounts/AccountAccessTable";
import { ErrorState, LoadingState } from "../components/ui/States";
import { formatDateTime } from "../lib/formatters";
import { getAccount, getAccountEvents, roleLabels } from "../services/accountsAdmin.api";

export function AccountDetailPage() {
  const { uuid = "" } = useParams();
  const { user } = useAuth();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["accounts", user?.uuid, uuid], queryFn: ({ signal }) => getAccount(uuid, signal), retry: false, gcTime: 0 });
  useEffect(() => { document.title = "User access | CaneGuard"; }, []);
  return <PageContent className="accounts-page">
    <Link className="accounts-back" to={routes.accounts}>Back to User Management</Link>
    {query.isPending ? <LoadingState message="Loading user…" /> : query.isError ? <ErrorState message="User details could not be loaded." onRetry={() => void query.refetch()} /> : query.data ? <>
      <PageHeader title={query.data.data.name} />
      <AccountAccessTable accounts={[query.data.data]} onSaved={async () => { await client.invalidateQueries({ queryKey: ["accounts"] }); }} />
      <AccountHistory key={uuid} uuid={uuid} />
    </> : null}
  </PageContent>;
}

function AccountHistory({ uuid }: { uuid: string }) {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ["accounts", user?.uuid, uuid, "history"], queryFn: ({ signal }) => getAccountEvents(uuid, signal), retry: false, gcTime: 0 });
  return <section className="accounts-history" aria-labelledby="account-history-heading">
    <h2 id="account-history-heading">Recent account history</h2>
    {query.isPending ? <LoadingState message="Loading history…" /> : query.isError ? <ErrorState message="Account history could not be loaded." onRetry={() => void query.refetch()} /> : query.data ? (
      query.data.data.length === 0 ? <p>No recorded account changes.</p> : <ol className="accounts-timeline">{query.data.data.map(event => <li key={event.id}>
        <header><strong>{event.action.replaceAll("_", " ")}</strong><time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time></header>
        <p>{event.actor_name} · {event.outcome}</p>
        {event.before && event.after ? <p>{roleLabels[event.before.role as keyof typeof roleLabels] ?? event.before.role} → {roleLabels[event.after.role as keyof typeof roleLabels] ?? event.after.role} · {event.before.is_active ? "Active" : "Disabled"} → {event.after.is_active ? "Active" : "Disabled"}</p> : null}
      </li>)}</ol>
    ) : null}
  </section>;
}
