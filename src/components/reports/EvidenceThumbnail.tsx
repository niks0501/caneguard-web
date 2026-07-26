import { Cloud, ImageOff } from "lucide-react";
import type { ImageStatus } from "../../domain/report.types";

export function EvidenceThumbnail({ status, label }: { status: ImageStatus; label: string }) {
  if (status !== "available") {
    return (
      <div className="evidence-thumbnail evidence-thumbnail--empty" aria-label={label}>
        {status === "pending_sync" ? <Cloud aria-hidden="true" /> : <ImageOff aria-hidden="true" />}
      </div>
    );
  }

  return (
    <div className="evidence-thumbnail evidence-visual" role="img" aria-label={label}>
      <span className="evidence-visual__sun" />
      <span className="evidence-visual__leaf evidence-visual__leaf--one" />
      <span className="evidence-visual__leaf evidence-visual__leaf--two" />
      <span className="evidence-visual__leaf evidence-visual__leaf--three" />
    </div>
  );
}
