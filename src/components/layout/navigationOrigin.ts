/**
 * Remembers which page the user came from so a deep page can offer a back
 * link to it. Recorded during AppShell's render (keyed by location, so it is
 * idempotent) so that child pages read an up-to-date value in the same render.
 */

export interface OriginLocation {
  pathname: string;
  search: string;
}

interface TrackedLocation extends OriginLocation {
  key: string;
}

let current: TrackedLocation | null = null;
let previous: OriginLocation | null = null;

const sectionLabels: Array<[RegExp, string]> = [
  [/^\/dashboard$/, "Home"],
  [/^\/todo$/, "To do"],
  [/^\/reports\/print$/, "Reports"],
  [/^\/reports$/, "Cases"],
  [/^\/monitoring$/, "Field visits"],
  [/^\/farmer-requests$/, "Farmer requests"],
  [/^\/accounts$/, "User Management"],
  [/^\/settings(\/[^/]+)?$/, "Settings"],
  [/^\/report-approval$/, "Report Approval"],
  [/^\/farmer-broadcasts$/, "Barangay broadcasts"],
];

function normalise(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

/** The name of a top-level page, or null for detail pages and unknown paths. */
export function sectionLabelForPath(pathname: string, search?: string): string | null {
  const path = normalise(pathname);
  if (path === "/monitoring" && search) {
    const view = new URLSearchParams(search).get("view");
    if (view === "boundaries") return "Field maps";
    if (view === "map") return "Monitoring Map";
  }
  return sectionLabels.find(([pattern]) => pattern.test(path))?.[1] ?? null;
}

function monitoringViewChanged(from: OriginLocation, to: OriginLocation) {
  if (normalise(to.pathname) !== "/monitoring") return false;
  return new URLSearchParams(from.search).get("view") !== new URLSearchParams(to.search).get("view");
}

export function trackLocation(location: { key: string; pathname: string; search: string }) {
  if (current?.key === location.key) return;
  if (current && (normalise(current.pathname) !== normalise(location.pathname) || monitoringViewChanged(current, location))) {
    previous = { pathname: current.pathname, search: current.search };
  }
  current = { key: location.key, pathname: location.pathname, search: location.search };
}

/** The last different top-level page the user was on, if any. */
export function previousSection(): (OriginLocation & { label: string }) | null {
  if (!previous) return null;
  const label = sectionLabelForPath(previous.pathname);
  return label ? { ...previous, label } : null;
}

export function resetNavigationOrigin() {
  current = null;
  previous = null;
}
