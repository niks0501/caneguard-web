import { PageContent, PageHeader } from "../components/layout/Page";
import { AerialAnalysisSettings } from "../components/reports/AerialAnalysisSettings";
import { OfficialRecipients } from "../components/reports/OfficialRecipients";
import { WeeklyReportingSettings } from "../components/reports/WeeklyReportingSettings";

export function AdminSettingsPage() {
  return <PageContent><PageHeader title="Admin Settings" /><WeeklyReportingSettings /><AerialAnalysisSettings /><OfficialRecipients /></PageContent>;
}
