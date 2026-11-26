import { ArrowLeft } from "lucide-react";
import { Link, useLocation } from "react-router";
import { readReturnContext } from "../navigation/mapNavigationContext";
import { previousSection } from "./navigationOrigin";

export interface BackTarget {
  to: string;
  label: string;
}

/**
 * Link above a page title that returns to the page the user came from.
 * `preferred` wins (e.g. a review queue snapshot), then a safe `returnContext`
 * in router state; otherwise the tracked
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
  const location = useLocation();
  const origin = previousSection();
  const tracked = origin && (!accepts || accepts(origin.pathname))
    ? { to: `${origin.pathname}${origin.search}`, label: origin.label }
    : null;
  const returnContext = readReturnContext(location.state);
  const stateReturn = returnContext && (!accepts || accepts(returnContext.to.split(/[?#]/)[0]))
    ? { to: returnContext.to, label: returnContext.label }
    : null;
  const target = preferred ?? stateReturn ?? tracked ?? fallback;
  if (!target) return null;
  const label = target.label.replace(/^Back to\s+/i, "");
  return (
    <Link className={className} to={target.to}>
      <ArrowLeft aria-hidden="true" />
      Back to {label}
    </Link>
  );
}
