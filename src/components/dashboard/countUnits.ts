/** "1 report" / "3 reports": every dashboard count prints its unit noun. */
export function reportCount(count: number, qualifier?: string): string {
  const unit = count === 1 ? "report" : "reports";
  return `${count} ${unit}${qualifier ? ` ${qualifier}` : ""}`;
}
