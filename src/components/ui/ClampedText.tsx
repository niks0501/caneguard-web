import { useState } from "react";

export interface ClampedTextProps {
  text: string;
  className?: string;
}

const PLACEHOLDER_VALUES = new Set([
  "Not provided",
  "Unavailable",
  "Not measured",
  "None reported",
  "Not attributed",
  "Not set",
]);

export function ClampedText({ text, className = "" }: ClampedTextProps) {
  const [expanded, setExpanded] = useState(false);

  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  const isPlaceholder = PLACEHOLDER_VALUES.has(trimmed);
  // Clamping applies to long free text (>140 chars or >2 line breaks) that is not a placeholder.
  const isLong = !isPlaceholder && (trimmed.length > 140 || trimmed.split("\n").length > 2);

  if (!isLong) {
    return <span className={className}>{trimmed}</span>;
  }

  return (
    <span className={`clamped-text-container ${className}`.trim()}>
      <span
        className={`clamped-text ${expanded ? "clamped-text--expanded" : "clamped-text--clamped"}`}
      >
        {trimmed}
      </span>
      <button
        type="button"
        className="clamped-text__toggle"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        {expanded ? "Show less" : `Show full text (${trimmed.length} characters)`}
      </button>
    </span>
  );
}
