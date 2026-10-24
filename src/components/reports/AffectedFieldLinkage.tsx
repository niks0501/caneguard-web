import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ZodError } from "zod";
import { ApiError, isApiConnectionError } from "../../api/ApiError";
import {
  FIELD_SURVEYS_MAX_LIMIT,
  type FieldSurveyBoundaryFeature,
  type FieldSurveyPolygon,
  type ReportAffectedField,
} from "../../domain/fieldSurvey.types";
import type { DiseaseReport } from "../../domain/report.types";
import { formatAffectedArea, formatDateTime } from "../../lib/formatters";
import { serviceUnreachableMessage, serviceUnreachableWhileShowingData } from "../../lib/serviceMessages";
import { useFieldSurveys } from "../../hooks/fieldSurveys";
import { useUpdateReportAffectedFields } from "../../hooks/useReports";
import { routes } from "../../app/routes";
import { Button } from "../ui/Button";
import { Pagination } from "../ui/Pagination";
import { Skeleton } from "../ui/States";
import { DetailField } from "../layout/Page";
import { useUnsavedWorkGuard } from "../ui/unsavedWorkContext";
import { boundaryCentroid, boundaryOutline } from "./boundaryShape";

type BoundaryChoice = {
  id: number;
  capturedAt: string;
  areaSqm: number;
  inspectorName: string;
  /** The Field boundaries viewer can resolve this boundary by id. */
  inArchive: boolean;
  /** This boundary is already linked from the report's earlier saved list. */
  linked: boolean;
  geometry?: FieldSurveyPolygon;
};

type RateDraft = Record<string, string>;

function ratesFor(fields: ReportAffectedField[] | undefined): RateDraft {
  return Object.fromEntries((fields ?? []).map((field) => [
    String(field.fieldSurveyId),
    String(field.lossRatePercent),
  ]));
}

function coordinateLabel(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(5)}° ${value < 0 ? negative : positive}`;
}

function lossRate(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

function isRateLimitedError(error: unknown) {
  return error instanceof ApiError && error.status === 429;
}

function boundaryChoices(
  features: FieldSurveyBoundaryFeature[],
  linkedFields: ReportAffectedField[],
  draftChoices: BoundaryChoice[],
  archivePage: boolean,
): BoundaryChoice[] {
  const choices = new Map<number, BoundaryChoice>();
  for (const feature of features) {
    choices.set(feature.properties.id, {
      id: feature.properties.id,
      capturedAt: feature.properties.capturedAt,
      areaSqm: feature.properties.areaSqm,
      inspectorName: feature.properties.inspector.name,
      inArchive: archivePage,
      linked: false,
      geometry: feature.geometry,
    });
  }
  for (const field of linkedFields) {
    if (!choices.has(field.fieldSurveyId)) {
      choices.set(field.fieldSurveyId, {
        id: field.fieldSurveyId,
        capturedAt: field.capturedAt,
        areaSqm: field.areaSqm,
        inspectorName: field.inspector.name,
        inArchive: false,
        linked: true,
        geometry: field.geometry,
      });
    }
  }
  for (const choice of draftChoices) {
    if (!choices.has(choice.id)) choices.set(choice.id, { ...choice, inArchive: false });
  }
  return [...choices.values()];
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "This case changed while the boundary links were being saved. Refresh the case before trying again.";
    if (error.status === 403) return "Your account no longer has permission to update affected boundaries.";
    if (error.status === 422) return "The service rejected one or more boundaries or loss rates. Review the entries and try again.";
    if (isRateLimitedError(error)) return "Boundary links are receiving too many requests. Wait a moment, then try again.";
  }
  if (error instanceof ZodError) return "CaneGuard returned affected-boundary data in an unexpected format. Refresh the case after the service is corrected.";
  if (isApiConnectionError(error)) return serviceUnreachableMessage;
  return "Affected field boundaries could not be saved. No change was confirmed.";
}

export function AffectedFieldLinkage({
  report,
  onRefresh,
}: {
  report: DiseaseReport;
  onRefresh: () => Promise<{ data?: DiseaseReport | null; isError?: boolean }>;
}) {
  const idPrefix = useId();
  const [lookupDraft, setLookupDraft] = useState("");
  const [lookupSearch, setLookupSearch] = useState("");
  const [lookupPage, setLookupPage] = useState(1);
  const [previewId, setPreviewId] = useState<number | null>(null);
  // Bounded server lookup: a search or page change never downloads the archive.
  const surveysQuery = useFieldSurveys({
    limit: FIELD_SURVEYS_MAX_LIMIT,
    page: lookupPage,
    search: lookupSearch,
  });
  const updateMutation = useUpdateReportAffectedFields(report.uuid);
  const [draft, setDraft] = useState<RateDraft>(() => ratesFor(report.affectedFields));
  const [draftVersion, setDraftVersion] = useState<number | undefined>(() => report.reviewVersion);
  const [draftChoices, setDraftChoices] = useState<BoundaryChoice[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const linkedFields = report.affectedFields ?? [];
  // The Field boundaries viewer loads the newest page only, so only that page's
  // rows can be resolved by the link this table offers.
  const archivePage = !surveysQuery.isPlaceholderData && lookupPage === 1 && lookupSearch === "";
  const choices = boundaryChoices(
    surveysQuery.data?.features ?? [],
    linkedFields,
    draftChoices,
    archivePage,
  );
  const metadata = surveysQuery.data?.metadata;
  const previewChoice = choices.find((choice) => choice.id === previewId) ?? null;
  const previewOutline = boundaryOutline(previewChoice?.geometry);
  const previewCentroid = boundaryCentroid(previewChoice?.geometry);
  const readReturnedNoRows = surveysQuery.isSuccess
    && !surveysQuery.isFetching
    && !surveysQuery.isError
    && !surveysQuery.isRefetchError
    && linkedFields.length === 0
    && choices.length === 0;
  const selectedIds = Object.keys(draft);
  const parsedFields = selectedIds.map((id) => ({
    fieldSurveyId: Number(id),
    lossRatePercent: lossRate(draft[id] ?? ""),
  }));
  const ratesValid = parsedFields.every((field) => field.lossRatePercent !== null);
  const existingById = new Map(linkedFields.map((field) => [field.fieldSurveyId, field.lossRatePercent]));
  const unchanged = selectedIds.length === linkedFields.length
    && parsedFields.every((field) => existingById.get(field.fieldSurveyId) === field.lossRatePercent);
  const canSave = !unchanged && ratesValid && !updateMutation.isPending;
  useUnsavedWorkGuard(!unchanged || draftChoices.length > 0);
  const mutationError = updateMutation.error;
  const staleVersion = mutationError instanceof ApiError && mutationError.status === 409;

  const setBoundarySelected = (id: number, selected: boolean) => {
    setDraft((current) => {
      const next = { ...current };
      if (selected) {
        const existing = linkedFields.find((field) => field.fieldSurveyId === id);
        next[String(id)] = existing ? String(existing.lossRatePercent) : "";
      } else {
        delete next[String(id)];
      }
      return next;
    });
    setDraftChoices((current) => {
      if (!selected) return current.filter((choice) => choice.id !== id);
      const choice = choices.find((item) => item.id === id);
      return choice ? [...current.filter((item) => item.id !== id), choice] : current;
    });
    setSavedNotice(null);
    updateMutation.reset();
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setSavedNotice(null);
    if (!ratesValid || unchanged || draftVersion === undefined) return;

    try {
      const result = await updateMutation.mutateAsync({
        expectedVersion: draftVersion,
        affectedFields: parsedFields.map((field) => ({
          fieldSurveyId: field.fieldSurveyId,
          lossRatePercent: field.lossRatePercent as number,
        })),
      });
      setDraft(ratesFor(result.affectedFields));
      setDraftVersion(result.version);
      setDraftChoices([]);
      setSubmitted(false);
      setSavedNotice("Affected field boundaries saved.");
    } catch {
      return;
    }
  };

  const refreshAfterConflict = async () => {
    try {
      const result = await onRefresh();
      if (result.data && !result.isError) {
        setDraft(ratesFor(result.data.affectedFields));
        setDraftVersion(result.data.reviewVersion);
        setDraftChoices([]);
        updateMutation.reset();
        setSubmitted(false);
      }
    } catch {
      return;
    }
  };

  return (
    <section className="review-card affected-field-linkage" aria-labelledby="affected-field-linkage-heading">
      <div className="section-heading affected-field-linkage__heading">
        <h2 id="affected-field-linkage-heading">Affected field boundaries</h2>
        <Link
          className="table-action"
          to={`${routes.monitoring}?view=boundaries`}
        >
          Field boundaries
        </Link>
      </div>
      <p className="affected-field-linkage__provenance">
        Area is device-reported. Loss rates are supplied by the office.
      </p>

      {surveysQuery.isPending && !surveysQuery.data ? (
        <div className="affected-field-linkage__loading" aria-busy="true">
          <p role="status">Loading field boundaries…</p>
          <Skeleton label="Loading field boundary choices" />
          <Skeleton label="Loading field boundary choices" />
        </div>
      ) : null}
      {surveysQuery.isError && !surveysQuery.data ? (
        <p className="form-error" role="alert">
          {isApiConnectionError(surveysQuery.error)
            ? `${serviceUnreachableMessage} Saved links remain shown below.`
            : isRateLimitedError(surveysQuery.error)
              ? "Boundary lookup is receiving too many requests. Wait a moment, then try again. Saved links remain shown below."
              : "Field boundary choices are unavailable. Saved links remain shown below; retry after access is restored."}
        </p>
      ) : null}
      {surveysQuery.isRefetchError && surveysQuery.data ? (
        <p className="queue-refresh-warning" role="alert">
          {isApiConnectionError(surveysQuery.error)
            ? serviceUnreachableWhileShowingData
            : isRateLimitedError(surveysQuery.error)
              ? "The boundary lookup refresh was rate limited. Wait a moment before trying again; previously loaded choices remain visible."
              : "The boundary archive could not be refreshed. Previously loaded choices remain visible and may be stale."}
        </p>
      ) : null}
      <form
        className="affected-field-linkage__lookup"
        role="search"
        aria-label="Boundary lookup"
        onSubmit={(event) => {
          event.preventDefault();
          setLookupPage(1);
          setLookupSearch(lookupDraft.trim());
        }}
      >
        <label>
          <span>Find an older boundary</span>
          <input
            type="search"
            maxLength={60}
            value={lookupDraft}
            placeholder="Boundary ID, inspector name or capture date"
            onChange={(event) => setLookupDraft(event.target.value)}
          />
        </label>
        <Button type="submit" variant="secondary">Search</Button>
        {lookupSearch ? (
          <Button
            type="button"
            variant="quiet"
            onClick={() => { setLookupDraft(""); setLookupSearch(""); setLookupPage(1); }}
          >
            Clear search
          </Button>
        ) : null}
      </form>
      {metadata && (lookupSearch || metadata.pageCount > 1 || metadata.truncated) ? (
        <p className="affected-field-linkage__truncated" role="status">
          {lookupSearch ? `Searching for "${lookupSearch}" · ` : ""}
          {metadata.totalCount} matching {metadata.totalCount === 1 ? "boundary" : "boundaries"}
          {metadata.pageCount > 1 ? ` · page ${metadata.page} of ${metadata.pageCount}` : ""}.
          {metadata.pageCount > 1
            ? " Linked boundaries stay selectable even when they are not on this page."
            : null}
          {metadata.truncated && metadata.page >= metadata.pageCount
            ? " This read stopped before the last matching boundary; refresh to load the rest."
            : null}
        </p>
      ) : null}

      {previewChoice ? (
        <div className="affected-field-linkage__preview" role="group" aria-label={`Boundary ${previewChoice.id} shape`}>
          {previewOutline.drawable ? (
            <svg viewBox="0 0 200 140" role="img" aria-label={`Stored shape of boundary ${previewChoice.id}`}>
              <polygon points={previewOutline.points} />
            </svg>
          ) : (
            <p className="form-error" role="alert">This boundary has no stored shape to preview.</p>
          )}
          <dl className="detail-list">
            <DetailField label="Boundary">{previewChoice.id}</DetailField>
            <DetailField label="Captured">{formatDateTime(previewChoice.capturedAt)}</DetailField>
            <DetailField label="Device-reported area">{formatAffectedArea(previewChoice.areaSqm / 10_000)}</DetailField>
            <DetailField label="Inspector">{previewChoice.inspectorName}</DetailField>
            <DetailField label="Location">
              {previewCentroid
                ? `${coordinateLabel(previewCentroid.latitude, "N", "S")}, ${coordinateLabel(previewCentroid.longitude, "E", "W")}`
                : "Location unavailable"}
            </DetailField>
            <DetailField label="Office loss rate">
              {Object.hasOwn(draft, String(previewChoice.id)) && draft[String(previewChoice.id)] !== ""
                ? `${draft[String(previewChoice.id)]}%`
                : "Not entered"}
            </DetailField>
          </dl>
        </div>
      ) : null}

      <form onSubmit={(event) => void save(event)}>
        {choices.length === 0 ? (
          readReturnedNoRows && (
            <p className="field-validation-table-card__empty">
              {lookupSearch
                ? "No boundaries match this search. Clear the search to see the newest boundaries."
                : lookupPage > 1
                  ? "No boundaries are on this page. Return to page 1 to see the newest boundaries."
                  : "No recorded field boundaries are available to link."}
            </p>
          )
        ) : (
          <div className="affected-field-linkage__table-scroll">
            <table className="field-validation-table affected-field-linkage__table">
              <caption className="sr-only">Affected field boundaries for this case</caption>
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Link boundary</span></th>
                  <th scope="col">Boundary</th>
                  <th scope="col">Area <span className="affected-field-linkage__source">device-reported</span></th>
                  <th scope="col">Office loss rate (%)</th>
                </tr>
              </thead>
              <tbody>
                {choices.map((choice) => {
                  const key = String(choice.id);
                  const checked = Object.hasOwn(draft, key);
                  const rateId = `${idPrefix}-rate-${choice.id}`;
                  const rateInvalid = checked && lossRate(draft[key] ?? "") === null;
                  return (
                    <tr key={choice.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={`Link boundary ${choice.id}`}
                          onChange={(event) => setBoundarySelected(choice.id, event.currentTarget.checked)}
                        />
                      </td>
                      <td>
                        <strong>Boundary {choice.id}</strong>
                        <span className="affected-field-linkage__capture">
                          <time dateTime={choice.capturedAt}>{formatDateTime(choice.capturedAt)}</time>
                          <span> · {choice.inspectorName}</span>
                        </span>
                        {choice.inArchive ? (
                          <Link
                            className="table-action"
                            to={`${routes.monitoring}?view=boundaries&boundary=${choice.id}`}
                          >
                            Show on Field boundaries
                          </Link>
                        ) : choice.linked ? (
                          <span className="affected-field-linkage__unavailable">Linked from an earlier boundary list</span>
                        ) : null}
                        {choice.geometry ? (
                          <button
                            type="button"
                            className="table-action"
                            onClick={() => setPreviewId(choice.id === previewId ? null : choice.id)}
                            aria-expanded={choice.id === previewId}
                          >
                            {choice.id === previewId ? "Hide shape" : "Preview shape"}
                          </button>
                        ) : null}
                      </td>
                      <td>{formatAffectedArea(choice.areaSqm / 10_000)}</td>
                      <td>
                        {checked ? (
                          <div className="affected-field-linkage__rate">
                            <label htmlFor={rateId}>
                              <span className="sr-only">Office loss rate for boundary {choice.id} (percent)</span>
                              <input
                                id={rateId}
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={draft[key] ?? ""}
                                aria-invalid={rateInvalid}
                                aria-describedby={rateInvalid ? `${rateId}-error` : undefined}
                                onChange={(event) => {
                                  setDraft((current) => ({ ...current, [key]: event.target.value }));
                                  setSavedNotice(null);
                                  updateMutation.reset();
                                }}
                              />
                            </label>
                            {rateInvalid ? <span id={`${rateId}-error`} className="form-error">Enter a rate from 0 to 100.</span> : null}
                          </div>
                        ) : <span aria-hidden="true">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {metadata && metadata.pageCount > 1 ? (
          <Pagination
            currentPage={metadata.page}
            pageCount={metadata.pageCount}
            itemCount={metadata.totalCount}
            itemLabel="boundaries"
            onPageChange={setLookupPage}
          />
        ) : null}

        {submitted && !ratesValid ? (
          <p className="form-error" role="alert">Enter an office loss rate from 0 to 100 for each linked boundary.</p>
        ) : null}
        {submitted && draftVersion === undefined ? (
          <p className="form-error" role="alert">Refresh this case before saving affected boundaries.</p>
        ) : null}
        {mutationError ? (
          <div className="affected-field-linkage__error" role="alert">
            <p>{errorMessage(mutationError)}</p>
            {staleVersion ? (
              <Button type="button" variant="secondary" onClick={() => void refreshAfterConflict()}>
                Refresh case and discard draft changes
              </Button>
            ) : null}
          </div>
        ) : null}
        {savedNotice ? <p className="success-banner" role="status">{savedNotice}</p> : null}
        <div className="affected-field-linkage__actions">
          <Button type="submit" disabled={!canSave}>
            {updateMutation.isPending ? "Saving boundaries…" : "Save affected boundaries"}
          </Button>
        </div>
      </form>
    </section>
  );
}
