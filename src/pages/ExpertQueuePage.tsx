import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { PageContent, PageHeader } from "../components/layout/Page";
import { ReportTable } from "../components/reports/ReportTable";
import { Pagination } from "../components/ui/Pagination";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/States";
import { useExpertQueue } from "../hooks/useReports";

export function ExpertQueuePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const filters = useMemo(() => ({ sort: "oldest" as const, page }), [page]);
  const queue = useExpertQueue(filters);
  const reports = queue.data?.reports ?? [];

  return (
    <PageContent>
      <PageHeader
        eyebrow="Expert workspace"
        title="Assigned expert referrals"
        description="Review only the open expert consults assigned to your account and record the response for each case."
      />
      {queue.isPending ? <LoadingState /> : null}
      {queue.isError ? (
        <ErrorState
          message="Your assigned expert queue could not be loaded."
          onRetry={() => void queue.refetch()}
        />
      ) : null}
      {!queue.isPending && !queue.isError && reports.length === 0 ? (
        <EmptyState />
      ) : null}
      {!queue.isPending && !queue.isError && reports.length > 0 ? (
        <section aria-labelledby="expert-queue-heading">
          <h2 id="expert-queue-heading" className="sr-only">Assigned expert referrals</h2>
          <ReportTable reports={reports} />
          {queue.data?.meta ? (
            <Pagination
              currentPage={queue.data.meta.currentPage}
              pageCount={queue.data.meta.lastPage}
              itemCount={queue.data.meta.total}
              onPageChange={(nextPage) => {
                setSearchParams(nextPage === 1 ? {} : { page: String(nextPage) });
              }}
            />
          ) : null}
        </section>
      ) : null}
    </PageContent>
  );
}
