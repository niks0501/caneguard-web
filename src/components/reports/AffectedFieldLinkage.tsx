import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ZodError } from "zod";
import { ApiError, isApiConnectionError } from "../../api/ApiError";
import {
  FIELD_SURVEYS_MAX_LIMIT,
  type FieldSurveyBoundaryFeature,
  type FieldSurveyPolygon,
  type InspectorBoundaryAttachment,
  type ReportAffectedField,
} from "../../domain/fieldSurvey.types";
import type { DiseaseReport, MeasurementProvenance } from "../../domain/report.types";
import {
  formatAreaHectares,
  formatDateTime,
  formatMeasuredArea,
  formatMeasuredPercent,
} from "../../lib/formatters";
import { serviceUnreachableMessage, serviceUnreachableWhileShowingData } from "../../lib/serviceMessages";
import { useFieldSurveys } from "../../hooks/fieldSurveys";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { useUpdateReportAffectedFields } from "../../hooks/useReports";
import { routes } from "../../app/routes";
import { Button } from "../ui/Button";
import { Pagination } from "../ui/Pagination";
import { Skeleton } from "../ui/States";
import { useUnsavedWorkGuard } from "../ui/unsavedWorkContext";
import { affectedFieldFormState } from "./affectedFieldFormState";
import { isAffectedAreaMeasured, percentAffected } from "../boundaries/fieldMapStatus";
import { latestPlotId, sortPlotsNewestFirst, summarizeCaseFieldMaps, supersedingPlotIds } from "../boundaries/fieldMapFreshness";
import { createReturnContext, withReturnContext } from "../navigation/mapNavigationContext";
import { boundaryCentroid, boundaryOutline, distanceMeters, pointInBoundary } from "./boundaryShape";

/** One field map as the phone measured it. Every number here comes from the phone. */
type FieldMap = {
  id: number;
  label: string | null;
  outlineFromSurveyId: number | null;
  capturedAt: string;
  areaSqm: number;
  affectedAreaSqm: number | null;
  affectedAreaMeasurement?: MeasurementProvenance | null;
  affectedPercent: number | null;
  inspectorName: string;
  geometry?: FieldSurveyPolygon;
};

type CaseLocation = { latitude: number; longitude: number };

function isRateLimitedError(error: unknown) {
  return error instanceof ApiError && error.status === 429;
}

function fromFeature(feature: FieldSurveyBoundaryFeature): FieldMap {
  const { properties } = feature;
  return {
    id: properties.id,
    label: properties.label ?? null,
    outlineFromSurveyId: properties.outlineFromSurveyId ?? null,
    capturedAt: properties.capturedAt,
    areaSqm: properties.areaSqm,
    affectedAreaSqm: properties.affectedAreaSqm,
    affectedAreaMeasurement: properties.affectedAreaMeasurement ?? null,
    affectedPercent: percentAffected(
      properties.areaSqm,
      properties.affectedAreaSqm,
      properties.affectedAreaMeasurement,
    ),
    inspectorName: properties.inspector.name,
    geometry: feature.geometry,
  };
}

function fromField(field: Omit<ReportAffectedField, "lossRatePercent">): FieldMap {
  const measured = isAffectedAreaMeasured(field.affectedAreaSqm, field.affectedAreaMeasurement);
  return {
    id: field.fieldSurveyId,
    label: field.label ?? null,
    outlineFromSurveyId: field.outlineFromSurveyId ?? null,
    capturedAt: field.capturedAt,
    areaSqm: field.areaSqm,
    affectedAreaSqm: field.affectedAreaSqm,
    affectedAreaMeasurement: field.affectedAreaMeasurement ?? null,
    affectedPercent: measured ? field.affectedPercent : null,
    inspectorName: field.inspector.name,
    geometry: field.geometry,
  };
}

function fieldMapChoices(
  features: FieldSurveyBoundaryFeature[],
  linked: FieldMap[],
  attached: FieldMap | null,
): FieldMap[] {
  const choices = new Map<number, FieldMap>();
  for (const feature of features) choices.set(feature.properties.id, fromFeature(feature));
  for (const map of linked) if (!choices.has(map.id)) choices.set(map.id, map);
  if (attached && !choices.has(attached.id)) choices.set(attached.id, attached);
  return [...choices.values()];
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "This case changed while the field map was being saved. Refresh the case before trying again.";
    if (error.status === 403) return "Your account no longer has permission to update this case's field map.";
    if (error.status === 422) return "The service rejected the selected field map. Choose again and retry.";
    if (isRateLimitedError(error)) return "Field maps are receiving too many requests. Wait a moment, then try again.";
  }
  if (error instanceof ZodError) return "CaneGuard returned field map data in an unexpected format. Refresh the case after the service is corrected.";
  if (isApiConnectionError(error)) return serviceUnreachableMessage;
  return "The field map could not be saved. No change was confirmed.";
}

function Outline({ map, label }: { map: FieldMap; label: string }) {
  const outline = boundaryOutline(map.geometry, 120, 84, 8);
  return outline.drawable ? (
    <svg className="field-map-outline" viewBox="0 0 120 84" role="img" aria-label={label}>
      <polygon points={outline.points} />
    </svg>
  ) : (
    <span className="field-map-outline field-map-outline--empty">No shape</span>
  );
}

function FieldMapSummary({
  map,
  caseLocation,
  status,
  newerIds,
  actions,
}: {
  map: FieldMap;
  caseLocation: CaseLocation | null;
  newerIds?: number[];
  status?: ReactNode;
  actions?: ReactNode;
}) {
  const inside = caseLocation && map.geometry ? pointInBoundary(map.geometry, caseLocation) : null;
  const affectedMeasured = isAffectedAreaMeasured(map.affectedAreaSqm, map.affectedAreaMeasurement);
  const measurementState: MeasurementProvenance = affectedMeasured ? "measured" : "not_measured";
  return (
    <article className="field-map" aria-label={`Field map ${map.id}`}>
      <Outline map={map} label={`Shape of field map ${map.id}`} />
      <div className="field-map__body">
        <h3 className="field-map__title">
          {map.label ?? `Map ${map.id}`}
          {status}
        </h3>
        <p className="field-map__meta">
          Measured by {map.inspectorName} · <time dateTime={map.capturedAt}>{formatDateTime(map.capturedAt)}</time>
        </p>
        {map.outlineFromSurveyId !== null ? (
          <p className="field-map__meta">Plot outline reused from Map {map.outlineFromSurveyId}</p>
        ) : null}
        {newerIds?.length ? (
          <p className="field-map__meta">Newer survey exists: Map {newerIds[0]}</p>
        ) : null}
        {inside !== null ? (
          <p className={`field-map__location${inside ? "" : " field-map__location--outside"}`}>
            {inside ? "Case location is inside this plot" : "Case location is outside this plot"}
          </p>
        ) : null}
        <dl className="field-map__numbers">
          <div><dt>Plot</dt><dd>{formatAreaHectares(map.areaSqm / 10_000)}</dd></div>
          <div><dt>Affected area</dt><dd>{formatMeasuredArea(map.affectedAreaSqm === null ? null : map.affectedAreaSqm / 10_000, measurementState)}</dd></div>
          <div><dt>% affected</dt><dd>{formatMeasuredPercent(map.affectedPercent, measurementState, { positiveArea: (map.affectedAreaSqm ?? 0) > 0 })}</dd></div>
        </dl>
        {actions ? <div className="field-map__actions">{actions}</div> : null}
      </div>
    </article>
  );
}

export function AffectedFieldLinkage({
  report,
  onRefresh,
}: {
  report: DiseaseReport;
  onRefresh: () => Promise<{ data?: DiseaseReport | null; isError?: boolean }>;
}) {
  const online = useOnlineStatus();
  const updateMutation = useUpdateReportAffectedFields(report.uuid);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selection, setSelection] = useState<number[]>([]);
  const [lookupDraft, setLookupDraft] = useState("");
  const [lookupSearch, setLookupSearch] = useState("");
  const [lookupPage, setLookupPage] = useState(1);
  const [version, setVersion] = useState<number | undefined>(() => report.reviewVersion);
  const [savedFields, setSavedFields] = useState<{ report: DiseaseReport; fields: ReportAffectedField[] } | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // The lookup only runs while the picker is open, so a case with a confirmed
  // map never downloads the district archive.
  const surveysQuery = useFieldSurveys(
    { limit: FIELD_SURVEYS_MAX_LIMIT, page: lookupPage, search: lookupSearch },
    { enabled: drawerOpen },
  );
  const linkedFields = savedFields?.report === report ? savedFields.fields : report.affectedFields ?? [];
  const linked = sortPlotsNewestFirst(linkedFields.map(fromField));
  const linkedIds = linkedFields.map((field) => field.fieldSurveyId);
  const attachment: InspectorBoundaryAttachment | null = report.inspectorAttachment ?? null;
  const attached = attachment?.boundary ? fromField(attachment.boundary) : null;
  const attachedConfirmed = attached !== null && linkedIds.includes(attached.id);
  const awaitingConfirmation = attached !== null && !attachedConfirmed;
  const caseLocation: CaseLocation | null =
    report.finalLatitude !== undefined && report.finalLongitude !== undefined
      ? { latitude: report.finalLatitude, longitude: report.finalLongitude }
      : null;

  const allPlots = attached && !linkedIds.includes(attached.id) ? [...linked, attached] : linked;
  const latestId = allPlots.length > 1 ? latestPlotId(allPlots) : null;
  const supersededBy = supersedingPlotIds(allPlots);
  const summary = summarizeCaseFieldMaps({ affectedFields: linkedFields, inspectorAttachment: report.inspectorAttachment });
  const caseReturnState = withReturnContext(createReturnContext(routes.reportDetail(report.uuid), `Case ${report.referenceCode}`));
  const latestTag = (id: number) => (latestId === id ? <span className="field-map__tag">Latest</span> : null);
  const viewOnMap = (id: number) => (
    <Link className="button button--secondary" to={routes.fieldMapForCase(report.uuid, id)} state={caseReturnState}>
      View on Field Map
    </Link>
  );

  const selectionDirty = drawerOpen
    && (selection.length !== linkedIds.length || selection.some((id) => !linkedIds.includes(id)));
  useUnsavedWorkGuard(selectionDirty);

  const mutationError = updateMutation.error;
  const staleVersion = mutationError instanceof ApiError && mutationError.status === 409;
  const formState = affectedFieldFormState({
    saved: savedNotice !== null,
    online,
    conflict: staleVersion,
    saving: updateMutation.isPending,
    failed: updateMutation.isError,
    dirty: selectionDirty,
  });

  const commit = async (ids: number[], notice: string) => {
    setSavedNotice(null);
    if (version === undefined) return;
    try {
      const result = await updateMutation.mutateAsync({
        expectedVersion: version,
        affectedFields: ids.map((fieldSurveyId) => ({ fieldSurveyId })),
      });
      setSavedFields({ report, fields: result.affectedFields });
      setVersion(result.version);
      setDrawerOpen(false);
      setSavedNotice(notice);
    } catch {
      return;
    }
  };

  const refreshAfterConflict = async () => {
    try {
      const result = await onRefresh();
      if (result.data && !result.isError) {
        setSavedFields({ report: result.data, fields: result.data.affectedFields ?? [] });
        setVersion(result.data.reviewVersion);
        setSelection((result.data.affectedFields ?? []).map((field) => field.fieldSurveyId));
        updateMutation.reset();
      }
    } catch {
      return;
    }
  };

  const openDrawer = () => {
    setSelection(linkedIds);
    setLookupDraft("");
    setLookupSearch("");
    setLookupPage(1);
    setSavedNotice(null);
    updateMutation.reset();
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    updateMutation.reset();
  };

  const choices = fieldMapChoices(surveysQuery.data?.features ?? [], linked, attached);
  const located = choices.map((choice) => {
    const centroid = boundaryCentroid(choice.geometry);
    const meters = caseLocation && centroid ? distanceMeters(caseLocation, centroid) : null;
    return { choice, meters };
  });
  // Nearest to the case first; maps without a usable location keep the server's newest-first order.
  const ordered = caseLocation
    ? [...located].sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity))
    : located;
  const metadata = surveysQuery.data?.metadata;
  const readReturnedNoRows = surveysQuery.isSuccess && !surveysQuery.isFetching && choices.length === 0;
  const busy = updateMutation.isPending || !online;

  return (
    <section
      className="review-card affected-field-linkage"
      aria-labelledby="affected-field-linkage-heading"
      data-state={formState}
    >
      <div className="section-heading affected-field-linkage__heading">
        <h2 id="affected-field-linkage-heading">Field measurement</h2>
        <Link className="table-action" to={routes.fieldMapForCase(report.uuid, summary.primaryBoundaryId)} state={caseReturnState}>
          View Field Map
        </Link>
      </div>

      {attachment && !attachment.boundary ? (
        <p className="affected-field-linkage__pending" role="status">
          The inspector's field map is still on their phone. It appears here once it syncs.
        </p>
      ) : null}

      {awaitingConfirmation && attached ? (
        <FieldMapSummary
          map={attached}
          caseLocation={caseLocation}
          newerIds={supersededBy.get(attached.id)}
          status={<><span className="field-map__tag field-map__tag--waiting">Waiting for you</span>{latestTag(attached.id)}</>}
          actions={(
            <>
              {viewOnMap(attached.id)}
              <Button type="button" disabled={busy} onClick={() => void commit([...linkedIds, attached.id], "Field confirmed.")}>
                {updateMutation.isPending ? "Confirming…" : "Confirm field"}
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={openDrawer}>
                Wrong field…
              </Button>
            </>
          )}
        />
      ) : null}

      {linked.map((map) => (
        <FieldMapSummary
          key={map.id}
          map={map}
          caseLocation={caseLocation}
          newerIds={supersededBy.get(map.id)}
          status={<><span className="field-map__tag">Confirmed</span>{latestTag(map.id)}</>}
          actions={(
            <>
              {viewOnMap(map.id)}
              <Button
                type="button"
                variant="quiet"
                disabled={busy}
                onClick={() => void commit(linkedIds.filter((id) => id !== map.id), "Field map removed.")}
              >
                Remove from case
              </Button>
            </>
          )}
        />
      ))}

      {linked.length === 0 && !awaitingConfirmation && !(attachment && !attachment.boundary) ? (
        <p className="affected-field-linkage__empty">No field map on this case yet.</p>
      ) : null}

      {!drawerOpen && !awaitingConfirmation ? (
        <div className="affected-field-linkage__actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={openDrawer}>
            {linked.length === 0 ? "Link a field map" : "Link another map"}
          </Button>
        </div>
      ) : null}

      {drawerOpen ? (
        <div className="affected-field-linkage__drawer" role="group" aria-label="Choose field maps">
          <div className="affected-field-linkage__drawer-heading">
            <h3>Choose field maps</h3>
            <p>{caseLocation ? "Nearest to this case first." : "Newest first."}</p>
          </div>
          <form
            className="affected-field-linkage__lookup"
            role="search"
            aria-label="Field map lookup"
            onSubmit={(event) => {
              event.preventDefault();
              setLookupPage(1);
              setLookupSearch(lookupDraft.trim());
            }}
          >
            <label>
              <span>Find a field map</span>
              <input
                type="search"
                maxLength={60}
                value={lookupDraft}
                placeholder="Map number, inspector name or date"
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

          {surveysQuery.isPending && !surveysQuery.data ? (
            <div className="affected-field-linkage__loading" aria-busy="true">
              <p role="status">Loading field maps…</p>
              <Skeleton label="Loading field maps" />
              <Skeleton label="Loading field maps" />
            </div>
          ) : null}
          {surveysQuery.isError && !surveysQuery.data ? (
            <p className="form-error" role="alert">
              {isApiConnectionError(surveysQuery.error)
                ? serviceUnreachableMessage
                : isRateLimitedError(surveysQuery.error)
                  ? "Field map lookup is receiving too many requests. Wait a moment, then try again."
                  : "Field maps are unavailable. Retry after access is restored."}
            </p>
          ) : null}
          {surveysQuery.isRefetchError && surveysQuery.data ? (
            <p className="queue-refresh-warning" role="alert">
              {isApiConnectionError(surveysQuery.error)
                ? serviceUnreachableWhileShowingData
                : "Field maps could not be refreshed. The ones shown may be stale."}
            </p>
          ) : null}
          {metadata && (lookupSearch || metadata.pageCount > 1) ? (
            <p className="affected-field-linkage__truncated" role="status">
              {lookupSearch ? `Searching for "${lookupSearch}" · ` : ""}
              {metadata.totalCount} matching {metadata.totalCount === 1 ? "map" : "maps"}
              {metadata.pageCount > 1 ? ` · page ${metadata.page} of ${metadata.pageCount}` : ""}
            </p>
          ) : null}

          {readReturnedNoRows ? (
            <p className="affected-field-linkage__empty">
              {lookupSearch ? "No field maps match this search." : "No field maps have been recorded yet."}
            </p>
          ) : null}

          <ul className="affected-field-linkage__choices">
            {ordered.map(({ choice, meters }) => {
              const checked = selection.includes(choice.id);
              return (
                <li key={choice.id} className={checked ? "is-selected" : undefined}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const nowChecked = event.currentTarget.checked;
                        setSelection((current) => nowChecked
                          ? [...current, choice.id]
                          : current.filter((id) => id !== choice.id));
                        setSavedNotice(null);
                        updateMutation.reset();
                      }}
                    />
                    <Outline map={choice} label={`Shape of field map ${choice.id}`} />
                    <span className="affected-field-linkage__choice-text">
                      <strong>{choice.label ?? `Map ${choice.id}`}{attached?.id === choice.id ? " · from this inspector" : ""}</strong>
                      <span>
                        {choice.inspectorName} · <time dateTime={choice.capturedAt}>{formatDateTime(choice.capturedAt)}</time>
                      </span>
                      <span>
                        {formatAreaHectares(choice.areaSqm / 10_000)}
                        {choice.affectedPercent === null ? "" : ` · ${formatMeasuredPercent(choice.affectedPercent, "measured", { positiveArea: (choice.affectedAreaSqm ?? 0) > 0 })} affected`}
                        {meters === null ? "" : ` · ${formatDistance(meters)} from case`}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {metadata && metadata.pageCount > 1 ? (
            <Pagination
              currentPage={metadata.page}
              pageCount={metadata.pageCount}
              itemCount={metadata.totalCount}
              itemLabel="field maps"
              onPageChange={setLookupPage}
            />
          ) : null}

          <div className="affected-field-linkage__drawer-actions">
            <span>{selection.length} selected</span>
            <Button type="button" variant="quiet" onClick={closeDrawer}>Cancel</Button>
            <Button
              type="button"
              disabled={!selectionDirty || busy}
              onClick={() => void commit(selection, "Field maps saved.")}
            >
              {updateMutation.isPending ? "Saving…" : "Save field maps"}
            </Button>
          </div>
        </div>
      ) : null}

      {!online && (selectionDirty || awaitingConfirmation) ? (
        <p className="form-error" role="alert">You are offline. Reconnect to confirm a field map.</p>
      ) : null}
      {version === undefined && (drawerOpen || awaitingConfirmation) ? (
        <p className="form-error" role="alert">Refresh this case before changing its field map.</p>
      ) : null}
      {mutationError ? (
        <div className="affected-field-linkage__error" role="alert">
          <p>{errorMessage(mutationError)}</p>
          {staleVersion ? (
            <Button type="button" variant="secondary" onClick={() => void refreshAfterConflict()}>
              Refresh case and discard changes
            </Button>
          ) : null}
        </div>
      ) : null}
      {savedNotice ? <p className="success-banner" role="status">{savedNotice}</p> : null}
    </section>
  );
}
