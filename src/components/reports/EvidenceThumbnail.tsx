import { Cloud, ImageOff } from "lucide-react";
import { useState } from "react";
import type { ImageStatus } from "../../domain/report.types";

export function EvidenceThumbnail({
  status,
  label,
  src,
  onLoadError,
}: {
  status: ImageStatus;
  label: string;
  src?: string;
  onLoadError?: () => void;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const imageFailed = Boolean(src && failedSrc === src);

  if (imageFailed) {
    return (
      <div
        className="evidence-thumbnail evidence-thumbnail--empty"
        role="img"
        aria-label="Image could not be loaded"
      >
        <ImageOff aria-hidden="true" />
      </div>
    );
  }

  if (status !== "available") {
    return (
      <div
        className="evidence-thumbnail evidence-thumbnail--empty"
        role="img"
        aria-label={label}
      >
        {status === "pending_sync" ? <Cloud aria-hidden="true" /> : <ImageOff aria-hidden="true" />}
      </div>
    );
  }

  if (src) {
    return (
      <div className="evidence-thumbnail">
        <img
          src={src}
          alt={label}
          loading="lazy"
          onError={() => {
            setFailedSrc(src);
            onLoadError?.();
          }}
        />
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
