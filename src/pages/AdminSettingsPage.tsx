import { PageContent, PageHeader } from "../components/layout/Page";
import { WeeklyReportingSettings } from "../components/reports/WeeklyReportingSettings";

export function AdminSettingsPage() {
  return <PageContent><PageHeader title="Admin Settings" /><WeeklyReportingSettings /></PageContent>;
}
