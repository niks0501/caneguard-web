import { useMemo } from "react";
import { FileSpreadsheet, FileText, ListFilter } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { routes } from "../app/routes";
import { PageContent, PageHeader } from "../components/layout/Page";
import {
  ReportDocumentBuilder,
  type ReportDocumentMode,
} from "../components/reports/ReportDocumentBuilder";
import { printableScopeFromSearch } from "../components/reports/reportBuilderScope";

const entries: { mode: ReportDocumentMode; title: string; icon: typeof FileText }[] = [
  { mode: "official", title: "This week's official report", icon: FileText },
  { mode: "rssi", title: "RSSI weekly", icon: FileSpreadsheet },
  { mode: "custom", title: "Custom list", icon: ListFilter },
];

function modeFromSearch(value: string | null): ReportDocumentMode {
  return value === "rssi" || value === "custom" ? value : "official";
}

export function PrintableReportsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = modeFromSearch(searchParams.get("type"));
  // The arriving work scope is read once, so editing the filters never re-seeds them.
  const scope = useMemo(() => printableScopeFromSearch(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageContent>
      <PageHeader title="Reports" />
      <div className="report-entries" role="group" aria-label="Report type">
        {entries.map(({ mode: entryMode, title, icon: Icon }) => (
          <button
            key={entryMode}
            type="button"
            className="report-entries__item"
            aria-pressed={mode === entryMode}
            onClick={() => setSearchParams((current) => {
              const next = new URLSearchParams(current);
              next.set("type", entryMode);
              return next;
            }, { replace: true })}
          >
            <Icon aria-hidden="true" size={20} />
            <span>{title}</span>
          </button>
        ))}
      </div>
      <ReportDocumentBuilder mode={mode} scope={scope} onClose={() => navigate(routes.reports)} />
    </PageContent>
  );
}
