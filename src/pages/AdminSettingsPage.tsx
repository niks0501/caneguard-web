import { PageContent, PageHeader } from "../components/layout/Page";
import { OfficialRecipients } from "../components/reports/OfficialRecipients";
import { WeeklyReportingSettings } from "../components/reports/WeeklyReportingSettings";

export function AdminSettingsPage() {
  return <PageContent><PageHeader title="Admin Settings" /><WeeklyReportingSettings /><OfficialRecipients /></PageContent>;
}
