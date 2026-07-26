import { formatConfidence } from "../../lib/formatters";

export function ConfidenceDisplay({ confidence }: { confidence: number }) {
  return (
    <div className="confidence" aria-label={`Model confidence ${formatConfidence(confidence)}`}>
      <strong>{formatConfidence(confidence)}</strong>
      <span aria-hidden="true"><i style={{ width: `${confidence * 100}%` }} /></span>
    </div>
  );
}
