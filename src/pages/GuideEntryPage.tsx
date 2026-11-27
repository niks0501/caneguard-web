import { useEffect } from "react";
import { useParams } from "react-router";
import { GuideEntryView } from "../components/public/GuideEntryView";
import { findFieldGuideEntry } from "../features/field-guide/entries";
import { NotFoundPage } from "./NotFoundPage";

export function GuideEntryPage() {
  const { entryId } = useParams();
  const entry = findFieldGuideEntry(entryId);

  useEffect(() => {
    document.title = entry
      ? `${entry.shortName} | Field Guide | CaneGuard`
      : "Page not found | CaneGuard";
  }, [entry]);

  if (!entry) return <NotFoundPage />;
  return (
    <div className="pub-ambient">
      <div className="pub-section">
        <GuideEntryView entry={entry} />
      </div>
    </div>
  );
}
