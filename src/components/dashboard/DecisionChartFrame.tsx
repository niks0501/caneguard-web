import type { ReactNode } from "react";

/**
 * Shared card frame for the three decision charts (overhaul §3.4, §5):
 * title, one optional short hint, the printed period (no repeated timezone —
 * the page names it once), the chart as role="img" with a headline
 * aria-label, and a visually-hidden data table as the accessible
 * equivalent. Long descriptions and "what to do" takeaways are gone: the
 * marks, printed values and legends carry the reading. `tableFootRows`
 * appends rows for a legend the card prints beside the chart, so the
 * accessible table keeps parity with every number on the card.
 */
export function DecisionChartFrame({
  titleId,
  title,
  periodLine,
  chartLabel,
  empty,
  emptyMessage,
  tableCaption,
  tableHead,
  tableRows,
  tableFootRows = [],
  span,
  children,
}: {
  titleId: string;
  title: string;
  periodLine: string;
  chartLabel: string;
  empty: boolean;
  emptyMessage: string;
  tableCaption: string;
  tableHead: string[];
  tableRows: string[][];
  /** Extra table rows for a legend the card prints outside the chart. */
  tableFootRows?: string[][];
  span: "col-6" | "col-12";
  children: ReactNode;
}) {
  return (
    <div className={span}>
      <section aria-labelledby={titleId} className="decision-chart-card">
        <h3 id={titleId} className="decision-chart-card__title">
          {title}
        </h3>
        <p className="decision-chart-card__period">{periodLine}</p>
        {empty ? (
          <p className="decision-chart-card__empty">{emptyMessage}</p>
        ) : (
          <div role="img" aria-label={chartLabel} className="decision-chart">
            {children}
          </div>
        )}
        <table className="sr-only">
          <caption>{tableCaption}</caption>
          <thead>
            <tr>
              {tableHead.map((head) => (
                <th key={head} scope="col">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, index) => (
              <tr key={`${row[0]}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
            {tableFootRows.map((row, index) => (
              <tr key={`${row[0]}-foot-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-foot-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
