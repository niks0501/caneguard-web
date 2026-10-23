/**
 * The earliest successful server read behind one workspace's surfaces: a page
 * is only as fresh as its oldest part. Reads that never returned data, or a
 * draft that only exists on a field device, contribute no stamp.
 */
export function oldestServerReadAt(
  reads: ReadonlyArray<{ data?: unknown; dataUpdatedAt?: number }>,
): number | undefined {
  const stamps = reads
    .filter((read) => Boolean(read.data))
    .map((read) => read.dataUpdatedAt)
    .filter((stamp): stamp is number => typeof stamp === "number" && Number.isFinite(stamp) && stamp > 0);
  return stamps.length ? Math.min(...stamps) : undefined;
}
