import { useState } from "react";
import { PageContent, PageHeader } from "../components/layout/Page";
import { WeeklyReportApproval } from "../components/reports/WeeklyReportApproval";
import { previousManilaIsoWeekAt } from "../domain/reportingTime";

export function ReportApprovalPage() {
  const [week, setWeek] = useState(previousManilaIsoWeekAt);
  return <PageContent>
    <PageHeader title="Report Approval" />
    <label className="settings-field"><span>Report week</span><input type="week" value={week} onChange={event => setWeek(event.target.value)} /></label>
    <WeeklyReportApproval key={week} week={week} />
  </PageContent>;
}
