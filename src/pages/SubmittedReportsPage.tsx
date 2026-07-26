import {
  useDeferredValue,
  useEffect,
  useMemo,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import {
  useLocation,
  useSearchParams,
} from "react-router";
import { ZodError } from "zod";
import { ApiError } from "../api/ApiError";
import { PageContent, PageHeader } from "../components/layout/Page";
import { ReportTable } from "../components/reports/ReportTable";
import { Button } from "../components/ui/Button";
import { SearchInput, SelectFilter } from "../components/ui/FormControls";
import { Pagination } from "../components/ui/Pagination";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoResultsState,
} from "../components/ui/States";
import {
  diseaseLabels,
  reviewStatusLabels,
} from "../domain/report.metadata";
import type { ReportFilters } from "../domain/report.types";
import { reportKeys } from "../hooks/reportQueries";
import { useReports } from "../hooks/useReports";
import {
  parseReportListUrl,
} from "./reportListUrlState";

type FilterKey =
  | "search"
  | "status"
  | "predicted_label"
  | "barangay"
  | "date_from"
  | "date_to"
  | "sort";

function isInvalidQueryError(error: unknown) {
  return error instanceof ApiError && error.status === 422;
}

function isAccessDeniedError(error: unknown) {
  return error instanceof ApiError && error.status === 403;
}

function isRateLimitedError(error: unknown) {
  return error instanceof ApiError && error.status === 429;
}

function isMalformedDataError(error: unknown) {
  return error instanceof ZodError;
}

export function SubmittedReportsPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const urlState = useMemo(
    () => parseReportListUrl(searchParams),
    [searchParams],
  );
  const deferredSearch = useDeferredValue(urlState.filters.search);
  const queryFilters = useMemo<ReportFilters>(
    () => ({
      ...urlState.filters,
      search: deferredSearch?.trim() || undefined,
      barangay: urlState.filters.barangay?.trim() || undefined,
    }),
    [deferredSearch, urlState.filters],
  );
  const reportsQuery = useReports(queryFilters, {
    enabled: !urlState.invalid,
  });
  const reports = reportsQuery.data?.reports ?? [];
  const meta = reportsQuery.data?.meta;

  useEffect(() => {
    if (
      meta &&
      meta.total > 0 &&
      meta.currentPage > meta.lastPage
    ) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("page", String(meta.lastPage));
        return next;
      }, { replace: true });
    }
  }, [meta, setSearchParams]);

  const updateFilter = (
    key: FilterKey,
    value: string,
    options: { replace?: boolean } = {},
  ) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    }, options);
  };

  const setPage = (page: number) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (page === 1) next.delete("page");
      else next.set("page", String(page));
      return next;
    });
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const refreshQueue = () =>
    queryClient.invalidateQueries({
      queryKey: reportKeys.list(queryFilters),
      exact: true,
    });

  const reviewNotice = (location.state as { notice?: string } | null)?.notice;
  const invalidQuery =
    urlState.invalid || isInvalidQueryError(reportsQuery.error);
  const accessDenied = isAccessDeniedError(reportsQuery.error);
  const rateLimited = isRateLimitedError(reportsQuery.error);
  const malformedData = isMalformedDataError(reportsQuery.error);
  const hasCachedData = Boolean(reportsQuery.data);
  const hasDisplayableData =
    hasCachedData && !accessDenied && !urlState.invalid;
  const showInitialError =
    reportsQuery.isError && (!hasCachedData || accessDenied);

  return (
    <PageContent>
      <PageHeader
        eyebrow="Case monitoring"
        title="Submitted reports"
        description="Review field observations and decide the appropriate municipal follow-up."
        actions={
          <Button
            variant="secondary"
            icon={
              <RefreshCw
                aria-hidden="true"
                className={reportsQuery.isFetching ? "spin" : undefined}
              />
            }
            disabled={
              reportsQuery.isFetching ||
              urlState.invalid ||
              !hasDisplayableData
            }
            onClick={refreshQueue}
          >
            {reportsQuery.isFetching ? "Refreshing queue" : "Refresh queue"}
          </Button>
        }
      />

      {reviewNotice ? (
        <div className="success-banner" role="status">
          <ClipboardCheck aria-hidden="true" />
          {reviewNotice}
        </div>
      ) : null}

      <section
        className="report-workspace"
        aria-labelledby="report-table-heading"
      >
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">Work queue</p>
            <h2 id="report-table-heading">Recent submissions</h2>
          </div>
          <span>
            {meta && hasDisplayableData
              ? `${meta.total} matching ${
                  meta.total === 1 ? "report" : "reports"
                }`
              : "Server-filtered queue"}
          </span>
        </div>

        <div className="filter-bar">
          <SearchInput
            value={urlState.filters.search ?? ""}
            maxLength={120}
            placeholder="Search ID, submitter, barangay..."
            onChange={(event) =>
              updateFilter("search", event.target.value, { replace: true })
            }
          />
          <SelectFilter
            label="Status"
            value={urlState.filters.status ?? ""}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(reviewStatusLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </SelectFilter>
          <SelectFilter
            label="Possible result"
            value={urlState.filters.disease ?? ""}
            onChange={(event) =>
              updateFilter("predicted_label", event.target.value)
            }
          >
            <option value="">All results</option>
            {Object.entries(diseaseLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </SelectFilter>
          <label className="select-filter">
            <span>Barangay</span>
            <input
              type="text"
              value={urlState.filters.barangay ?? ""}
              maxLength={120}
              placeholder="All barangays"
              onChange={(event) =>
                updateFilter("barangay", event.target.value, {
                  replace: true,
                })
              }
            />
          </label>
          <label className="select-filter">
            <span>From date</span>
            <input
              type="date"
              value={urlState.filters.dateFrom ?? ""}
              max={urlState.filters.dateTo}
              onChange={(event) =>
                updateFilter("date_from", event.target.value)
              }
            />
          </label>
          <label className="select-filter">
            <span>To date</span>
            <input
              type="date"
              value={urlState.filters.dateTo ?? ""}
              min={urlState.filters.dateFrom}
              onChange={(event) =>
                updateFilter("date_to", event.target.value)
              }
            />
          </label>
          <SelectFilter
            label="Sort by"
            value={urlState.filters.sort ?? "newest"}
            onChange={(event) =>
              updateFilter("sort", event.target.value)
            }
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="confidence_desc">Highest confidence</option>
            <option value="confidence_asc">Lowest confidence</option>
          </SelectFilter>
        </div>

        {reportsQuery.isFetching && hasDisplayableData ? (
          <p className="queue-refresh-status" role="status">
            Refreshing this server-filtered queue…
          </p>
        ) : null}
        {reportsQuery.isRefetchError && hasDisplayableData ? (
          <p className="queue-refresh-warning" role="alert">
            {rateLimited
              ? "The latest refresh was rate limited. Wait a moment before trying again; the previous queue remains visible."
              : malformedData
                ? "The latest response had an unexpected format. The previous queue remains visible."
                : "The latest refresh failed. Showing the most recently loaded queue."}
          </p>
        ) : null}

        {urlState.invalid ? (
          <ErrorState
            message="The report URL contains an invalid filter or page. Clear the filters to return to the queue."
            onRetry={clearFilters}
          />
        ) : null}
        {!urlState.invalid && reportsQuery.isPending ? <LoadingState /> : null}
        {!urlState.invalid && showInitialError && invalidQuery ? (
          <ErrorState
            message="The server rejected one or more report filters. Clear them and try again."
            onRetry={clearFilters}
          />
        ) : null}
        {!urlState.invalid && showInitialError && accessDenied ? (
          <ErrorState message="Your account does not have access to the submitted report queue." />
        ) : null}
        {!urlState.invalid && showInitialError && malformedData ? (
          <ErrorState
            message="CaneGuard returned report data in an unexpected format. Refresh after the service is corrected."
            onRetry={() => reportsQuery.refetch()}
          />
        ) : null}
        {!urlState.invalid && showInitialError && rateLimited ? (
          <ErrorState
            message="The report queue is receiving too many requests. Wait a moment, then try again."
            onRetry={() => reportsQuery.refetch()}
          />
        ) : null}
        {!urlState.invalid &&
        showInitialError &&
        !invalidQuery &&
        !accessDenied &&
        !rateLimited &&
        !malformedData ? (
          <ErrorState
            message="The submitted report service is unavailable. Please try again."
            onRetry={() => reportsQuery.refetch()}
          />
        ) : null}
        {hasDisplayableData &&
        meta?.total === 0 &&
        !urlState.hasActiveFilters ? (
          <EmptyState />
        ) : null}
        {hasDisplayableData &&
        meta?.total === 0 &&
        urlState.hasActiveFilters ? (
          <NoResultsState onClear={clearFilters} />
        ) : null}
        {hasDisplayableData && reports.length > 0 && meta ? (
          <>
            <ReportTable reports={reports} />
            <Pagination
              currentPage={meta.currentPage}
              pageCount={meta.lastPage}
              itemCount={meta.total}
              onPageChange={setPage}
            />
          </>
        ) : null}
      </section>
    </PageContent>
  );
}
