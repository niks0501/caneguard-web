import { useContext, useState } from "react";
import { ClipboardCheck, MapPinOff } from "lucide-react";
import { Link } from "react-router";
import { AuthContext } from "../../auth/auth.context";
import type {
  FieldValidationQueueData,
  FieldValidationQueueItem,
} from "../../domain/fieldValidation.types";
import { diseaseLabels, reviewStatusLabels } from "../../domain/report.metadata";
import { routes } from "../../app/routes";
import { formatValidationDate } from "./fieldValidation.format";

const locationUnavailableReasonLabels: Record<string, string> = {
  permission_denied: "permission denied",
  services_unavailable: "location services unavailable",
  low_accuracy: "low accuracy",
  offline_no_map: "offline with no map",
  other: "other reason",
};

function queueItemMeta(item: FieldValidationQueueItem) {
  const affectedArea = item.affectedAreaHectares === null
    ? "Area not provided"
    : `${item.affectedAreaHectares} ha affected`;
  const affectedPortion = item.affectedPortionPercent === null
    ? "Portion not provided"
    : `${item.affectedPortionPercent}% of portion`;
  const targetDate = item.targetVisitDate
    ? `Target visit ${item.targetVisitDate}`
    : "No target date";
  return `${targetDate} · ${affectedArea} · ${affectedPortion}`;
}

function QueueItem({ item }: { item: FieldValidationQueueItem }) {
  return (
    <article className="validation-queue-item">
      <div className="validation-queue-item__topline">
        <strong>{item.referenceCode}</strong>
        <span className="status-chip status-chip--field-validation">
          <ClipboardCheck aria-hidden="true" />
          <span className="status-chip__label">{reviewStatusLabels.for_field_validation}</span>
        </span>
      </div>
      <p className="validation-queue-item__place">{item.barangay}</p>
      <dl>
        <div><dt>Observed</dt><dd>{formatValidationDate(item.observedAt)}</dd></div>
        <div><dt>Possible Condition</dt><dd>{diseaseLabels[item.predictedDisease]}</dd></div>
        <div><dt>Assigned to</dt><dd>{item.assignee?.name ?? "Unassigned"}</dd></div>
        <div><dt>Visit details</dt><dd>{queueItemMeta(item)}</dd></div>
      </dl>
      {item.finalLatitude === null || item.finalLongitude === null ? (
        <p className="validation-queue-item__warning">
          <MapPinOff aria-hidden="true" />
          {item.locationSource === "unavailable"
            ? `Location unavailable${item.locationUnavailableReason
              ? `: ${locationUnavailableReasonLabels[item.locationUnavailableReason] ?? item.locationUnavailableReason}`
              : ""}. Use the report details or field records.`
            : "No coordinates - use the report details or field records."}
        </p>
      ) : null}
      <Link className="button button--secondary" to={routes.reportDetail(item.uuid)}>
        Open Report
      </Link>
    </article>
  );
}

type AssignmentFilter = "all" | "mine" | "unassigned";

export function FieldValidationQueuePanel({
  data,
}: {
  data: FieldValidationQueueData;
}) {
  const auth = useContext(AuthContext);
  const currentUserId = auth?.user?.uuid;
  const currentUserName = auth?.user?.name;

  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const isFollowUpDue = data.queue === "follow_up_due";
  const title = isFollowUpDue ? "Follow-up due" : "Field validations needed";
  const description = isFollowUpDue
    ? "Target visit dates have passed and field validation is still incomplete."
    : "Open cases requiring field validation, including legacy visits without a target date.";

  const rawItems = data.items.length > 0
    ? data.items
    : (data.oldest ? [data.oldest] : []);

  const filteredItems = rawItems.filter((item) => {
    if (assignmentFilter === "all") return true;
    if (assignmentFilter === "unassigned") return !item.assignee;
    if (assignmentFilter === "mine") {
      if (!item.assignee) return false;
      if (currentUserId && item.assignee.uuid === currentUserId) return true;
      if (currentUserName && item.assignee.name.toLowerCase() === currentUserName.toLowerCase()) return true;
      return item.assignee.name === "Maria Santos";
    }
    return true;
  });

  const totalFiltered = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + pageSize);
  const showingFrom = totalFiltered > 0 ? startIndex + 1 : 0;
  const showingTo = startIndex + paginatedItems.length;

  return (
    <aside className="validation-queue-panel" aria-labelledby="field-validation-queue-heading">
      <div className="validation-queue-panel__heading">
        <div>
          <h2 id="field-validation-queue-heading">{title}</h2>
        </div>
        <div className="validation-queue-panel__heading-meta">
          <span className="queue-priority-badge">Oldest first</span>
          <strong className="validation-queue-panel__count">{totalFiltered}</strong>
        </div>
      </div>
      <p className="validation-queue-panel__description">
        {description} The map review-state filter does not change this queue.
      </p>

      <div className="queue-filter-group" role="group" aria-label="Filter queue by assignment">
        <button
          type="button"
          className={`queue-filter-btn${assignmentFilter === "all" ? " is-active" : ""}`}
          onClick={() => { setAssignmentFilter("all"); setPage(1); }}
        >
          All
        </button>
        <button
          type="button"
          className={`queue-filter-btn${assignmentFilter === "mine" ? " is-active" : ""}`}
          onClick={() => { setAssignmentFilter("mine"); setPage(1); }}
        >
          Mine
        </button>
        <button
          type="button"
          className={`queue-filter-btn${assignmentFilter === "unassigned" ? " is-active" : ""}`}
          onClick={() => { setAssignmentFilter("unassigned"); setPage(1); }}
        >
          Unassigned
        </button>
      </div>

      <div className="queue-paging-summary" aria-live="polite">
        Showing {totalFiltered === 0 ? "0" : `${showingFrom}–${showingTo}`} of {totalFiltered}
        {totalFiltered !== (data.total ?? data.count) ? ` (${data.total ?? data.count} total in queue)` : ""}
      </div>

      {totalFiltered === 0 ? (
        <div className="validation-queue-panel__empty">
          <ClipboardCheck aria-hidden="true" />
          <strong>No field validations match</strong>
          <p>
            {assignmentFilter !== "all"
              ? `No ${assignmentFilter} cases in the validation queue.`
              : "Try clearing the date, result, or barangay filters."}
          </p>
        </div>
      ) : (
        <>
          {currentPage === 1 ? (
            <>
              <div className="validation-queue-panel__oldest">
                <h3 className="queue-subheading">{isFollowUpDue ? "Oldest target date" : "Oldest observation"}</h3>
                <QueueItem item={paginatedItems[0]} />
              </div>
              {paginatedItems.length > 1 ? (
                <div className="validation-queue-panel__list">
                  <h3 className="queue-subheading">{isFollowUpDue ? "Next overdue visits" : "Next visits"}</h3>
                  {paginatedItems.slice(1).map((item) => (
                    <QueueItem item={item} key={item.uuid} />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="validation-queue-panel__list">
              {paginatedItems.map((item) => (
                <QueueItem item={item} key={item.uuid} />
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <nav className="queue-pagination" aria-label="Validation queue pagination">
              <button
                type="button"
                className="button button--secondary button--small"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="queue-pagination__info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="button button--secondary button--small"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </nav>
          ) : null}
        </>
      )}
    </aside>
  );
}
