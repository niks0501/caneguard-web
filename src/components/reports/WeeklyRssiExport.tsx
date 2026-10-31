import { useCallback, useState } from "react";
import axios from "axios";
import { Download } from "lucide-react";
import { axiosClient } from "../../api/axiosClient";
import { ApiError, isApiConnectionError } from "../../api/ApiError";
import { env } from "../../config/env";
import { Button } from "../ui/Button";

export type WeeklyRssiReportPeriod = {
  periodType: "weekly" | "monthly" | "custom";
  week: string;
  month: string;
  from: string;
  to: string;
};

type ExportFormat = "pdf" | "csv";

const exportPath = "/api/v1/reports/rssi-weekly/export";

function periodParams(period: WeeklyRssiReportPeriod) {
  const params = new URLSearchParams();
  params.set("period_type", period.periodType);
  if (period.periodType === "weekly") params.set("week", period.week);
  if (period.periodType === "monthly") params.set("month", period.month);
  if (period.periodType === "custom") {
    params.set("from", period.from);
    params.set("to", period.to);
  }
  return params;
}

function weeklyRssiPeriodIsComplete(period: WeeklyRssiReportPeriod) {
  if (period.periodType === "weekly") return /^\d{4}-W\d{2}$/.test(period.week);
  if (period.periodType === "monthly") return /^\d{4}-\d{2}$/.test(period.month);
  return /^\d{4}-\d{2}-\d{2}$/.test(period.from) && /^\d{4}-\d{2}-\d{2}$/.test(period.to) && period.from <= period.to;
}

function periodLabel(period: WeeklyRssiReportPeriod) {
  if (period.periodType === "weekly") return period.week ? `week ${period.week}` : "no week selected";
  if (period.periodType === "monthly") return period.month || "no month selected";
  return `${period.from || "?"} to ${period.to || "?"}`;
}

function fileStem(period: WeeklyRssiReportPeriod) {
  const stem = period.periodType === "weekly"
    ? period.week
    : period.periodType === "monthly"
      ? period.month
      : `${period.from}-to-${period.to}`;
  return stem.replace(/[^a-zA-Z0-9-]+/g, "-");
}

async function readBlobErrorCode(error: unknown) {
  const axiosError = axios.isAxiosError(error)
    ? error
    : error instanceof ApiError && axios.isAxiosError(error.cause)
      ? error.cause
      : undefined;
  const responseData = axiosError?.response?.data;
  if (!(responseData instanceof Blob)) return undefined;

  try {
    const payload: unknown = JSON.parse(await responseData.text());
    return payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string"
      ? payload.code
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Downloads of the weekly RSSI report that office staff email to the SRA by
 * hand. The scope is fixed on purpose: reviewed and validated RSSI cases in the
 * selected period, with suspected cases kept out of the validated totals, no
 * farmer or farm names, and no infestation percentage because no calculation for
 * one is confirmed.
 */
export function WeeklyRssiExport({
  period,
  disabled = false,
}: {
  period: WeeklyRssiReportPeriod;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const complete = weeklyRssiPeriodIsComplete(period);
  const blocked = disabled || !complete || pending !== null;

  const download = useCallback(async (format: ExportFormat) => {
    setPending(format);
    setError(null);
    try {
      const params = periodParams(period);
      params.set("format", format);
      const response = await axiosClient.get(
        `${env.apiBaseUrl}${exportPath}?${params.toString()}`,
        { responseType: "blob" },
      );
      if (typeof URL.createObjectURL !== "function") return;

      const blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `caneguard-rssi-weekly-${fileStem(period)}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    } catch (requestError) {
      if (isApiConnectionError(requestError)) {
        setError("CaneGuard cannot be reached right now. Check your connection, then try again.");
      } else if (await readBlobErrorCode(requestError) === "PDF_RENDER_FAILED") {
        setError("The RSSI PDF could not be generated. Download the RSSI CSV instead, or try again later.");
      } else {
        setError("The RSSI export could not be generated. Try again.");
      }
    } finally {
      setPending(null);
    }
  }, [period]);

  return (
    <section className="report-builder__rssi" aria-label="Weekly RSSI export">
      <p className="report-builder__scope">
        <strong>Scope:</strong> reviewed and validated RSSI cases for {periodLabel(period)}, submitted in this
        period. Suspected RSSI cases are listed separately and never added to the validated totals. Farmer and
        farm names are not included.
      </p>
      <p className="report-builder__scope">
        Infestation percentage is not reported: CaneGuard has no confirmed calculation method for it.
      </p>
      <div className="report-builder__actions">
        <Button type="button" icon={<Download aria-hidden="true" />} disabled={blocked} onClick={() => void download("pdf")}>
          {pending === "pdf" ? "Preparing RSSI PDF..." : "Download RSSI PDF"}
        </Button>
        <Button type="button" variant="secondary" icon={<Download aria-hidden="true" />} disabled={blocked} onClick={() => void download("csv")}>
          {pending === "csv" ? "Preparing RSSI CSV..." : "Download RSSI CSV"}
        </Button>
      </div>
      {!complete ? <p className="report-builder__scope" role="status">Choose a complete reporting period to download the weekly RSSI report.</p> : null}
      {error ? <div className="report-builder__error" role="alert">{error}</div> : null}
    </section>
  );
}
