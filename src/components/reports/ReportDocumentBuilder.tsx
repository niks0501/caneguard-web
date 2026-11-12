import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Download, Printer } from "lucide-react";
import { env } from "../../config/env";
import { axiosClient } from "../../api/axiosClient";
import { ApiError, isApiConnectionError, toApiError } from "../../api/ApiError";
import { checkApiHealth } from "../../api/apiHealth";
import { Button } from "../ui/Button";
import { WeeklyReportApproval } from "./WeeklyReportApproval";
import { WeeklyRssiExport } from "./WeeklyRssiExport";
import { previousManilaIsoWeekAt } from "../../domain/reportingTime";
import {
  activeAuthorityClassifiedConditionLabels,
  caseStateLabels,
  diseaseLabels,
  fieldValidationFilterOptions,
  fieldValidationStateLabels,
  verificationOutcomeLabels,
} from "../../domain/report.metadata";
import {
  printableScopeIsApplied,
  printableScopeSummary,
  type BuilderFilters,
  type PrintableBuilderScope,
} from "./reportBuilderScope";

const storageKey = "caneguard-report-builder-filters";
const documentPath = "/api/v1/reports/documents/report";

type PeriodType = "weekly" | "monthly" | "custom";

type BuilderState = {
  periodType: PeriodType;
  week: string;
  month: string;
  from: string;
  to: string;
  appendix: boolean;
  filters: BuilderFilters;
};

export type ReportDocumentMode = "official" | "rssi" | "custom";

type StoredBuilderState = Pick<BuilderState, "periodType" | "week" | "month" | "from" | "to">;

function readStoredState(): Partial<StoredBuilderState> {
  try {
    const value = sessionStorage.getItem(storageKey);
    return value ? JSON.parse(value) as Partial<StoredBuilderState> : {};
  } catch {
    return {};
  }
}

function defaultWeek() {
  return previousManilaIsoWeekAt();
}

function initialState(scope: PrintableBuilderScope): BuilderState {
  const stored = readStoredState();
  return {
    periodType: scope.customPeriod ? "custom" : stored.periodType ?? "weekly",
    week: stored.week ?? defaultWeek(),
    month: stored.month ?? "",
    from: scope.customPeriod?.from ?? stored.from ?? "",
    to: scope.customPeriod?.to ?? stored.to ?? "",
    appendix: false,
    filters: { ...scope.filters },
  };
}

/** The one rule for adopting the arriving work scope, used by Reset. */
function withScope(current: BuilderState, scope: PrintableBuilderScope): BuilderState {
  return {
    ...current,
    periodType: scope.customPeriod ? "custom" : current.periodType,
    from: scope.customPeriod?.from ?? current.from,
    to: scope.customPeriod?.to ?? current.to,
    filters: { ...scope.filters },
  };
}

async function readPdfErrorCode(error: unknown) {
  const axiosError = axios.isAxiosError(error)
    ? error
    : error instanceof ApiError && axios.isAxiosError(error.cause)
      ? error.cause
      : undefined;
  if (!axiosError || typeof Blob === "undefined") return undefined;
  const responseData = axiosError.response?.data;
  if (!(responseData instanceof Blob)) return undefined;

  try {
    const payload: unknown = JSON.parse(await responseData.text());
    return payload && typeof payload === "object" && "code" in payload &&
      typeof payload.code === "string"
      ? payload.code
      : undefined;
  } catch {
    return undefined;
  }
}

function queryFor(state: BuilderState, format?: "pdf") {
  const params = new URLSearchParams();
  params.set("period_type", state.periodType);
  if (state.periodType === "weekly") params.set("week", state.week);
  if (state.periodType === "monthly") params.set("month", state.month);
  if (state.periodType === "custom") {
    params.set("from", state.from);
    params.set("to", state.to);
  }
  params.set("appendix", state.appendix ? "1" : "0");
  if (format) params.set("format", format);
  Object.entries(state.filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params;
}

function periodLabel(state: BuilderState) {
  if (state.periodType === "weekly") return state.week ? `Week ${state.week}` : "No week selected";
  if (state.periodType === "monthly") return state.month || "No month selected";
  if (!state.from || !state.to) return "Incomplete date range";
  return `${state.from} to ${state.to}`;
}

function moreHasValue(state: BuilderState) {
  const { verification_outcome, field_validation_state, authority_classified_condition, queue } = state.filters;
  return Boolean(verification_outcome || field_validation_state || authority_classified_condition || queue || state.appendix);
}

/**
 * Three documents, each named for what it is. The official weekly report is a
 * sealed district version; the RSSI weekly is a download; the custom list is a
 * filtered printable view. They never share a control, so a filtered preview
 * cannot be mistaken for the official document.
 */
export function ReportDocumentBuilder({
  mode,
  scope,
  onClose,
}: {
  mode: ReportDocumentMode;
  scope: PrintableBuilderScope;
  onClose: () => void;
}) {
  const [state, setState] = useState<BuilderState>(() => initialState(scope));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [apiAvailability, setApiAvailability] = useState<"checking" | "available" | "unavailable">("checking");
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfPending, setPdfPending] = useState(false);
  const previewFrame = useRef<HTMLIFrameElement | null>(null);
  const apiOrigin = useMemo(() => new URL(env.apiBaseUrl).origin, []);

  useEffect(() => {
    try {
      const stored: StoredBuilderState = {
        periodType: state.periodType,
        week: state.week,
        month: state.month,
        from: state.from,
        to: state.to,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(stored));
    } catch {
      // Session persistence is an enhancement; the builder remains usable.
    }
  }, [state]);

  useEffect(() => {
    let active = true;
    const checkingTimer = window.setTimeout(() => {
      if (active) setApiAvailability("checking");
    }, 0);
    void checkApiHealth().then((result) => {
      window.clearTimeout(checkingTimer);
      if (active) {
        setApiAvailability(result.reachability === "reachable" ? "available" : "unavailable");
      }
    });
    return () => {
      active = false;
      window.clearTimeout(checkingTimer);
    };
  }, []);

  const params = useMemo(() => queryFor(state), [state]);
  useEffect(() => {
    if (mode !== "custom") return;
    const timer = window.setTimeout(() => {
      if (apiAvailability === "available") {
        setPreviewUrl(`${env.apiBaseUrl}${documentPath}?${params.toString()}`);
        setPdfError(null);
      } else {
        setPreviewUrl(null);
      }
    }, apiAvailability === "available" ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [apiAvailability, mode, params]);

  const update = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) =>
    setState((current) => ({ ...current, [key]: value }));
  const updateFilter = (key: keyof BuilderFilters, value: string) =>
    setState((current) => ({ ...current, filters: { ...current.filters, [key]: value } }));

  const downloadPdf = useCallback(async () => {
    setPdfPending(true);
    setPdfError(null);
    try {
      const response = await axiosClient.get(
        `${env.apiBaseUrl}${documentPath}/pdf?${queryFor(state, "pdf").toString()}`,
        { responseType: "blob" },
      );
      const blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `caneguard-report-${periodLabel(state).replaceAll(/[^a-zA-Z0-9-]+/g, "-")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    } catch (error) {
      if (isApiConnectionError(error)) {
        setPdfError("CaneGuard cannot be reached right now. Check your connection, then try again. The HTML preview remains available.");
      } else {
        const apiError = toApiError(error);
        const errorCode = apiError.code ?? await readPdfErrorCode(error);
        setPdfError(errorCode === "PDF_RENDER_FAILED"
          ? "The report preview is available, but the PDF service could not produce a file. Ask your office administrator to check the report renderer, then try Download PDF again."
          : "The PDF could not be generated. Your live preview is still available; use Print or try Download PDF again.");
      }
    } finally {
      setPdfPending(false);
    }
  }, [state]);

  // The embedded document lives on the API origin. Accept only its messages,
  // from that exact origin and that exact frame: nothing else may download.
  const downloadRef = useRef(downloadPdf);
  useEffect(() => {
    downloadRef.current = downloadPdf;
  }, [downloadPdf]);
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== apiOrigin) return;
      if (event.source !== previewFrame.current?.contentWindow) return;
      if (event.data?.type === "caneguard-report-download") void downloadRef.current();
      if (event.data?.type === "caneguard-report-close") onClose();
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [apiOrigin, onClose]);

  function retryApiConnection() {
    setApiAvailability("checking");
    void checkApiHealth().then((result) => {
      setApiAvailability(result.reachability === "reachable" ? "available" : "unavailable");
    });
  }

  function printPreview() {
    // The document prints in its own window; the parent cannot call into a
    // cross-origin frame. The explicit API origin is the only target allowed.
    previewFrame.current?.contentWindow?.postMessage({ type: "caneguard-report-print" }, apiOrigin);
  }

  function resetToWorkScope() {
    setState((current) => withScope(current, scope));
  }

  const scopeChanged = !printableScopeIsApplied(state, scope);
  const unreachableAlert = (
    <div className="report-builder__error" role="alert">
      <p>CaneGuard cannot be reached right now. Check your connection, then try again. The report preview needs the API service.</p>
      <Button type="button" variant="secondary" onClick={retryApiConnection}>Retry connection</Button>
    </div>
  );
  const periodControls = (
    <>
      <label><span>Period</span><select value={state.periodType} onChange={(event) => update("periodType", event.target.value as PeriodType)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom range</option></select></label>
      {state.periodType === "weekly" ? <label><span>Week</span><input type="week" value={state.week} onChange={(event) => update("week", event.target.value)} /></label> : null}
      {state.periodType === "monthly" ? <label><span>Month</span><input type="month" value={state.month} onChange={(event) => update("month", event.target.value)} /></label> : null}
      {state.periodType === "custom" ? <><label><span>From</span><input type="date" value={state.from} onChange={(event) => update("from", event.target.value)} /></label><label><span>To</span><input type="date" value={state.to} onChange={(event) => update("to", event.target.value)} /></label></> : null}
    </>
  );
  if (mode === "official") {
    return (
      <section className="report-builder__official" aria-label="Official weekly version">
        <h2>This week&apos;s official report</h2>
        <label><span>Week</span><input type="week" value={state.week} onChange={(event) => update("week", event.target.value)} /></label>
        <WeeklyReportApproval key={state.week} week={state.week} />
      </section>
    );
  }

  if (mode === "rssi") {
    return (
      <section className="report-builder__page-section" aria-label="RSSI weekly">
        <h2>RSSI weekly</h2>
        <div className="report-builder__controls">{periodControls}</div>
        <WeeklyRssiExport
          period={{
            periodType: state.periodType,
            week: state.week,
            month: state.month,
            from: state.from,
            to: state.to,
          }}
          disabled={apiAvailability !== "available"}
        />
        {apiAvailability === "unavailable" ? unreachableAlert : null}
      </section>
    );
  }

  return (
    <section className="report-builder__page-section" aria-label="Custom list">
      <h2>Custom list</h2>
      <div className="report-builder__controls">
        {periodControls}
        <label><span>Barangay</span><input type="text" value={state.filters.barangay} placeholder="All barangays" onChange={(event) => updateFilter("barangay", event.target.value)} /></label>
        <label><span>Possible Condition</span><select value={state.filters.predicted_label} onChange={(event) => updateFilter("predicted_label", event.target.value)}><option value="">All conditions</option>{Object.entries(diseaseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Case state</span><select value={state.filters.case_state} onChange={(event) => updateFilter("case_state", event.target.value)}><option value="">All case states</option>{Object.entries(caseStateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <details className="report-builder__more" open={moreHasValue(state) || undefined}>
        <summary>More</summary>
        <div className="report-builder__controls">
          <label><span>Verification</span><select value={state.filters.verification_outcome} onChange={(event) => updateFilter("verification_outcome", event.target.value)}><option value="">All outcomes</option>{Object.entries(verificationOutcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Field validation</span><select value={state.filters.field_validation_state} onChange={(event) => updateFilter("field_validation_state", event.target.value)}><option value="">All states</option>{fieldValidationFilterOptions.map((value) => <option key={value} value={value}>{fieldValidationStateLabels[value]}</option>)}</select></label>
          <label><span>Staff condition</span><select value={state.filters.authority_classified_condition} onChange={(event) => updateFilter("authority_classified_condition", event.target.value)}><option value="">All classifications</option>{Object.entries(activeAuthorityClassifiedConditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Operational queue</span><select value={state.filters.queue} onChange={(event) => updateFilter("queue", event.target.value)}><option value="">All queues</option><option value="needs_review">Needs review</option><option value="needs_visit">Needs visit</option><option value="follow_up_due">Follow-up due</option><option value="upcoming">Upcoming visits</option><option value="unverified_no_active_work">Unverified, no active work</option></select></label>
          <label className="report-builder__check"><input type="checkbox" checked={state.appendix} onChange={(event) => update("appendix", event.target.checked)} /><span>Include farmer/farm identifier appendix</span></label>
        </div>
      </details>

      <div className="report-builder__scope" aria-label="Printable report scope">
        <p>
          <strong>Scope:</strong> {printableScopeSummary(state.filters, periodLabel(state))} · all matching cases in this period
        </p>
        {scope.removed.length > 0 ? (
          <p role="status">Not carried into this document: {scope.removed.join(", ")}.</p>
        ) : null}
        {scopeChanged ? (
          <Button type="button" variant="secondary" onClick={resetToWorkScope}>Reset to the current work scope</Button>
        ) : null}
      </div>
      {state.appendix ? <p className="report-builder__warning" role="note">Farmer and farm references are included when the appendix is enabled.</p> : null}

      <div className="report-builder__actions">
        <Button type="button" variant="secondary" icon={<Printer aria-hidden="true" />} disabled={!previewUrl} onClick={printPreview}>Print</Button>
        <Button type="button" icon={<Download aria-hidden="true" />} disabled={pdfPending || apiAvailability !== "available"} onClick={() => void downloadPdf()}>{pdfPending ? "Preparing PDF..." : "Download PDF"}</Button>
      </div>
      {apiAvailability === "unavailable" ? unreachableAlert : null}
      {pdfError ? <div className="report-builder__error" role="alert">{pdfError}</div> : null}
      <div className="report-builder__preview" aria-label="Live report preview">
        {apiAvailability === "checking" ? <p>Checking the CaneGuard API connection...</p> : previewUrl ? <iframe ref={previewFrame} title="Live report preview" src={previewUrl} tabIndex={-1} /> : apiAvailability === "available" ? <p>Preparing the report preview...</p> : null}
      </div>
    </section>
  );
}
