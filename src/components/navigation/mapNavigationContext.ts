/** Where a map-bound navigation came from, carried in router state so the map can offer a way back. */
export interface MapReturnContext {
  to: string;
  label: string;
  clusterKeys?: string[];
  clusterCoordinates?: [number, number];
}

const SAFE_PREFIX = /^\/(reports|monitoring|dashboard|todo)([/?#]|$)/;

export function isSafeInternalReturnPath(to: string): boolean {
  if (typeof to !== "string" || to.trim() === "" || to !== to.trim()) return false;
  if (to.startsWith("//") || to.includes("\\")) return false;
  return SAFE_PREFIX.test(to);
}

export function createReturnContext(
  to: string,
  label: string,
  extra?: { clusterKeys?: string[]; clusterCoordinates?: [number, number] },
): MapReturnContext {
  return { to, label, ...extra };
}

export function readReturnContext(state: unknown): MapReturnContext | null {
  const value = (state as { returnContext?: unknown } | null | undefined)?.returnContext;
  if (!value || typeof value !== "object") return null;
  const { to, label, clusterKeys, clusterCoordinates } = value as Record<string, unknown>;
  if (typeof to !== "string" || !isSafeInternalReturnPath(to)) return null;
  if (typeof label !== "string" || label.trim() === "") return null;
  const context: MapReturnContext = { to, label: label.trim() };
  if (clusterKeys !== undefined) {
    if (!Array.isArray(clusterKeys) || !clusterKeys.every((key) => typeof key === "string")) return null;
    context.clusterKeys = clusterKeys;
  }
  if (clusterCoordinates !== undefined) {
    if (!Array.isArray(clusterCoordinates) || clusterCoordinates.length !== 2
      || !clusterCoordinates.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    context.clusterCoordinates = [clusterCoordinates[0], clusterCoordinates[1]];
  }
  return context;
}

export function withReturnContext(returnContext: MapReturnContext): { returnContext: MapReturnContext } {
  return { returnContext };
}
