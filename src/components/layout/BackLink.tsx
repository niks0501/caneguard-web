import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { previousSection } from "./navigationOrigin";

export interface BackTarget {
  to: string;
  label: string;
}

/**
 * Link above a page title that returns to the page the user came from.
 * `preferred` wins (e.g. a review queue snapshot); otherwise the tracked
 * origin is used when `accepts` allows it; otherwise `fallback`, if any.
 */
export function BackLink({
  fallback,
  preferred,
  accepts,
  className = "back-link",
}: {
  fallback?: BackTarget;
  preferred?: BackTarget | null;
  accepts?: (pathname: string) => boolean;
  className?: string;
}) {
  const origin = previousSection();
  const tracked = origin && (!accepts || accepts(origin.pathname))
    ? { to: `${origin.pathname}${origin.search}`, label: origin.label }
    : null;
  const target = preferred ?? tracked ?? fallback;
  if (!target) return null;
  return (
    <Link className={className} to={target.to}>
      <ArrowLeft aria-hidden="true" />
      Back to {target.label}
    </Link>
  );
}
