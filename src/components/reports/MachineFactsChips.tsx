import type { ReportMachineFacts } from "../../domain/report.types";

const checklistLabels: Record<string, string> = {
  consistent: "Signature: consistent",
  inconsistent: "Signature: differs",
  inconclusive: "Signature: inconclusive",
};

const locationLabels: Record<string, string> = {
  gps: "GPS",
  manual_map: "Manual map",
  unavailable: "Location unavailable",
};

function warningLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function MachineFactsChips({
  facts,
  compact = false,
}: {
  facts: ReportMachineFacts;
  compact?: boolean;
}) {
  const chips: string[] = [];
  if (facts.checklistConsistency) {
    chips.push(checklistLabels[facts.checklistConsistency] ?? `Checklist ${facts.checklistConsistency.replaceAll("_", " ")}`);
  }
  chips.push(
    facts.qualityWarnings.length > 0
      ? `Image quality: ${facts.qualityWarnings.length} ${facts.qualityWarnings.length === 1 ? "warning" : "warnings"}`
      : "Image quality: clean",
  );
  if (facts.locationSource === "gps" && facts.gpsAccuracy !== null && facts.gpsAccuracy !== undefined) {
    chips.push(`GPS ±${facts.gpsAccuracy} m`);
  } else if (facts.locationSource) {
    chips.push(locationLabels[facts.locationSource] ?? facts.locationSource.replaceAll("_", " "));
  } else if (facts.gpsAccuracy !== null && facts.gpsAccuracy !== undefined) {
    chips.push(`GPS ±${facts.gpsAccuracy} m`);
  }
  if (facts.reporterMismatch === true) {
    chips.push("Reporter: flags mismatch");
  } else if (facts.reporterMismatch === false) {
    chips.push("Reporter: agrees");
  } else if (facts.reporterConcern) {
    chips.push(`Reporter: reports ${facts.reporterConcern}`);
  }

  if (chips.length === 0) {
    return <span className="machine-facts-empty" aria-hidden={compact || undefined}>Machine facts unavailable</span>;
  }

  return (
    <div
      className={`machine-fact-chips${compact ? " machine-fact-chips--compact" : ""}`}
      aria-label={compact ? undefined : "Machine facts — decision support"}
      aria-hidden={compact || undefined}
    >
      {chips.map((chip) => (
        <span className="machine-fact-chip" key={chip} title={chip.includes("quality") ? facts.qualityWarnings.map(warningLabel).join(", ") : undefined}>
          {chip}
        </span>
      ))}
    </div>
  );
}
