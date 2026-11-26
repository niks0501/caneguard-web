import type { DiseaseReport } from "../../domain/report.types";

export interface PlotChronologyItem {
  id: number;
  capturedAt: string;
  outlineFromSurveyId?: number | null;
}

function capturedMs(item: PlotChronologyItem): number {
  const ms = Date.parse(item.capturedAt);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

export function comparePlotsNewestFirst(a: PlotChronologyItem, b: PlotChronologyItem): number {
  const am = capturedMs(a);
  const bm = capturedMs(b);
  if (am !== bm) return am > bm ? -1 : 1;
  return b.id - a.id;
}

export function sortPlotsNewestFirst<T extends PlotChronologyItem>(items: readonly T[]): T[] {
  return [...items].sort(comparePlotsNewestFirst);
}

export function latestPlotId(items: readonly PlotChronologyItem[]): number | null {
  return sortPlotsNewestFirst(items)[0]?.id ?? null;
}

/** Older plot id -> ids of newer plots re-measured from it, newest first. */
export function supersedingPlotIds(items: readonly PlotChronologyItem[]): Map<number, number[]> {
  const result = new Map<number, number[]>();
  for (const item of sortPlotsNewestFirst(items)) {
    const older = item.outlineFromSurveyId;
    if (older === null || older === undefined || older === item.id) continue;
    result.set(older, [...(result.get(older) ?? []), item.id]);
  }
  return result;
}

export type CaseFieldMapPlotStatus = "confirmed" | "waiting";

export interface CaseFieldMapPlot {
  fieldSurveyId: number;
  label: string | null;
  capturedAt: string;
  status: CaseFieldMapPlotStatus;
  outlineFromSurveyId: number | null;
  inspectorName: string;
  areaSqm: number;
  affectedPercent: number | null;
}

export interface CaseFieldMapSummary {
  state: "ready" | "pending_sync" | "none";
  plots: CaseFieldMapPlot[];
  primaryBoundaryId: number | null;
  latestBoundaryId: number | null;
  newerWaitingPlot: CaseFieldMapPlot | null;
  pendingSync: boolean;
  confirmedCount: number;
  waitingCount: number;
}

type PlotSource = NonNullable<DiseaseReport["affectedFields"]>[number];

function toPlot(field: Pick<PlotSource, "fieldSurveyId" | "label" | "capturedAt" | "outlineFromSurveyId" | "inspector" | "areaSqm" | "affectedPercent">, status: CaseFieldMapPlotStatus): CaseFieldMapPlot {
  return {
    fieldSurveyId: field.fieldSurveyId,
    label: field.label ?? null,
    capturedAt: field.capturedAt,
    status,
    outlineFromSurveyId: field.outlineFromSurveyId ?? null,
    inspectorName: field.inspector.name,
    areaSqm: field.areaSqm,
    affectedPercent: field.affectedPercent,
  };
}

const asItem = (plot: CaseFieldMapPlot): PlotChronologyItem => ({
  id: plot.fieldSurveyId,
  capturedAt: plot.capturedAt,
});

export function summarizeCaseFieldMaps(
  report: Pick<DiseaseReport, "affectedFields" | "inspectorAttachment">,
): CaseFieldMapSummary {
  const byId = new Map<number, CaseFieldMapPlot>();
  for (const field of report.affectedFields ?? []) {
    if (!byId.has(field.fieldSurveyId)) byId.set(field.fieldSurveyId, toPlot(field, "confirmed"));
  }
  const attached = report.inspectorAttachment?.boundary;
  if (attached && !byId.has(attached.fieldSurveyId)) byId.set(attached.fieldSurveyId, toPlot(attached, "waiting"));

  const plots = [...byId.values()].sort((a, b) => comparePlotsNewestFirst(asItem(a), asItem(b)));
  const pendingSync = Boolean(report.inspectorAttachment && !report.inspectorAttachment.boundary);
  const newestConfirmed = plots.find((plot) => plot.status === "confirmed") ?? null;
  const newestWaiting = plots.find((plot) => plot.status === "waiting") ?? null;
  const primary = newestConfirmed ?? newestWaiting;
  const newerWaitingPlot = newestConfirmed && newestWaiting
    && comparePlotsNewestFirst(asItem(newestWaiting), asItem(newestConfirmed)) < 0
    ? newestWaiting
    : null;

  return {
    state: plots.length > 0 ? "ready" : pendingSync ? "pending_sync" : "none",
    plots,
    primaryBoundaryId: primary?.fieldSurveyId ?? null,
    latestBoundaryId: plots[0]?.fieldSurveyId ?? null,
    newerWaitingPlot,
    pendingSync,
    confirmedCount: plots.filter((plot) => plot.status === "confirmed").length,
    waitingCount: plots.filter((plot) => plot.status === "waiting").length,
  };
}
