import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Download, Printer, X } from "lucide-react";
import { env } from "../../config/env";
import { axiosClient } from "../../api/axiosClient";
import { ApiError, isApiConnectionError, toApiError } from "../../api/ApiError";
import { checkApiHealth } from "../../api/apiHealth";
import { Button } from "../ui/Button";
import { previousManilaIsoWeekAt } from "../../domain/reportingTime";
import {
  authorityClassifiedConditionLabels,
  caseStateLabels,
  diseaseLabels,
  fieldValidationStateLabels,
  verificationOutcomeLabels,
} from "../../domain/report.metadata";

const storageKey = "caneguard-report-builder-filters";
const documentPath = "/api/v1/reports/documents/report";

type PeriodType = "weekly" | "monthly" | "custom";
type BuilderFilters = {
  queue: string;
  predicted_label: string;
  barangay: string;
  case_state: string;
  verification_outcome: string;
  field_validation_state: string;
  authority_classified_condition: string;
};

type BuilderState = {
  periodType: PeriodType;
  week: string;
  month: string;
  from: string;
  to: string;
  appendix: boolean;
  filters: BuilderFilters;
};

const emptyFilters: BuilderFilters = {
  queue: "",
  predicted_label: "",
  barangay: "",
  case_state: "",
  verification_outcome: "",
  field_validation_state: "",
  authority_classified_condition: "",
};

function readStoredState(): Partial<BuilderState> {
  try {
    const value = sessionStorage.getItem(storageKey);
    return value ? JSON.parse(value) as Partial<BuilderState> : {};
  } catch {
    return {};
  }
}

function defaultWeek() {
  return previousManilaIsoWeekAt();
}

function initialState(): BuilderState {
  const stored = readStoredState();
  return {
    periodType: stored.periodType ?? "weekly",
    week: stored.week ?? defaultWeek(),
    month: stored.month ?? "",
    from: stored.from ?? "",
    to: stored.to ?? "",
    appendix: false,
    filters: { ...emptyFilters, ...(stored.filters ?? {}) },
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

export function ReportDocumentBuilder({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [state, setState] = useState<BuilderState>(initialState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [apiAvailability, setApiAvailability] = useState<"checking" | "available" | "unavailable">("checking");
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfPending, setPdfPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ ...state, appendix: false }));
    } catch {
      // Session persistence is an enhancement; the builder remains usable.
    }
  }, [open, state]);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const params = useMemo(() => queryFor(state), [state]);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      if (apiAvailability === "available") {
        setPreviewUrl(`${env.apiBaseUrl}${documentPath}?${params.toString()}`);
        setPdfError(null);
      } else {
        setPreviewUrl(null);
      }
    }, apiAvailability === "available" ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [apiAvailability, open, params]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === "caneguard-report-download") {
        void downloadPdf();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  });

  const update = <K extends keyof BuilderState>(key: K, value: BuilderState[K]) =>
    setState((current) => ({ ...current, [key]: value }));
  const updateFilter = (key: keyof BuilderFilters, value: string) =>
    setState((current) => ({ ...current, filters: { ...current.filters, [key]: value } }));

  async function downloadPdf() {
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
      link.download = "caneguard-report.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    } catch (error) {
      if (isApiConnectionError(error)) {
        setPdfError("Cannot connect to the CaneGuard API. Start the API server and verify VITE_API_BASE_URL, then retry.");
      } else {
        const apiError = toApiError(error);
        const errorCode = apiError.code ?? await readPdfErrorCode(error);
        setPdfError(errorCode === "PDF_RENDER_FAILED"
          ? "The API is reachable, but its server-side PDF renderer is unavailable. Ask an administrator to check the configured Chromium or Brave binary and its runtime permissions. The HTML preview remains available."
          : "The PDF could not be generated. Your live preview is still available; use Print or try Download PDF again.");
      }
    } finally {
      setPdfPending(false);
    }
  }

  function retryApiConnection() {
    setApiAvailability("checking");
    void checkApiHealth().then((result) => {
      setApiAvailability(result.reachability === "reachable" ? "available" : "unavailable");
    });
  }

  function printPreview() {
    document.querySelector<HTMLIFrameElement>(".report-builder__preview iframe")?.contentWindow?.print();
  }

  if (!open) return null;

  return (
    <div className="report-builder" role="dialog" aria-modal="true" aria-labelledby="report-builder-title">
      <div className="report-builder__panel">
        <header className="report-builder__header">
          <div><p className="eyebrow">CaneGuard documents</p><h2 id="report-builder-title">Generate report</h2><p>Choose a period and preview the real printable document before saving it.</p></div>
          <button type="button" className="icon-button" aria-label="Close report builder" onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        <div className="report-builder__controls">
          <label><span>Period</span><select value={state.periodType} onChange={(event) => update("periodType", event.target.value as PeriodType)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom range</option></select></label>
          {state.periodType === "weekly" ? <label><span>Week</span><input type="week" value={state.week} onChange={(event) => update("week", event.target.value)} /></label> : null}
          {state.periodType === "monthly" ? <label><span>Month</span><input type="month" value={state.month} onChange={(event) => update("month", event.target.value)} /></label> : null}
          {state.periodType === "custom" ? <><label><span>From</span><input type="date" value={state.from} onChange={(event) => update("from", event.target.value)} /></label><label><span>To</span><input type="date" value={state.to} onChange={(event) => update("to", event.target.value)} /></label></> : null}
          <label><span>Barangay</span><input type="text" value={state.filters.barangay} placeholder="All barangays" onChange={(event) => updateFilter("barangay", event.target.value)} /></label>
          <label><span>Possible Condition</span><select value={state.filters.predicted_label} onChange={(event) => updateFilter("predicted_label", event.target.value)}><option value="">All conditions</option>{Object.entries(diseaseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Case state</span><select value={state.filters.case_state} onChange={(event) => updateFilter("case_state", event.target.value)}><option value="">All case states</option>{Object.entries(caseStateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Verification</span><select value={state.filters.verification_outcome} onChange={(event) => updateFilter("verification_outcome", event.target.value)}><option value="">All outcomes</option>{Object.entries(verificationOutcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Field validation</span><select value={state.filters.field_validation_state} onChange={(event) => updateFilter("field_validation_state", event.target.value)}><option value="">All states</option>{Object.entries(fieldValidationStateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Staff condition</span><select value={state.filters.authority_classified_condition} onChange={(event) => updateFilter("authority_classified_condition", event.target.value)}><option value="">All classifications</option>{Object.entries(authorityClassifiedConditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Operational queue</span><select value={state.filters.queue} onChange={(event) => updateFilter("queue", event.target.value)}><option value="">All queues</option><option value="needs_review">Needs review</option><option value="needs_visit">Needs visit</option><option value="follow_up_due">Follow-up due</option><option value="upcoming">Upcoming visits</option></select></label>
          <label className="report-builder__check"><input type="checkbox" checked={state.appendix} onChange={(event) => update("appendix", event.target.checked)} /><span>Include case register appendix</span></label>
        </div>
        {state.appendix ? <p className="report-builder__warning" role="note">Farmer and farm references are included when the appendix is enabled.</p> : null}
        {apiAvailability === "unavailable" ? (
          <div className="report-builder__error" role="alert">
            <p>Cannot connect to the CaneGuard API for report preview or PDF generation. Start the API server and verify VITE_API_BASE_URL points to the same host and port as this Web preview.</p>
            <Button type="button" variant="secondary" onClick={retryApiConnection}>Retry API connection</Button>
          </div>
        ) : null}
        <div className="report-builder__actions"><Button type="button" variant="secondary" icon={<Printer aria-hidden="true" />} disabled={!previewUrl} onClick={printPreview}>Print</Button><Button type="button" icon={<Download aria-hidden="true" />} disabled={pdfPending || apiAvailability !== "available"} onClick={() => void downloadPdf()}>{pdfPending ? "Preparing PDF..." : "Download PDF"}</Button></div>
        {pdfError ? <div className="report-builder__error" role="alert">{pdfError}</div> : null}
        <div className="report-builder__preview" aria-label="Live report preview">
          {apiAvailability === "checking" ? <p>Checking the CaneGuard API connection...</p> : previewUrl ? <iframe title="Live report preview" src={previewUrl} /> : apiAvailability === "available" ? <p>Preparing the report preview...</p> : null}
        </div>
      </div>
    </div>
  );
}
