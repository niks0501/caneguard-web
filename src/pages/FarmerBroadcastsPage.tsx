import { useEffect } from "react";
import { FarmerBroadcastsSection } from "../components/farmers/FarmerBroadcastsSection";
import { PageContent, PageHeader } from "../components/layout/Page";

export function FarmerBroadcastsPage() {
  useEffect(() => { document.title = "Barangay broadcasts | CaneGuard"; }, []);
  return <PageContent className="accounts-page">
    <PageHeader title="Barangay broadcasts" description="Guidance for farmers. Not part of cases, maps or reports." />
    <FarmerBroadcastsSection />
  </PageContent>;
}
