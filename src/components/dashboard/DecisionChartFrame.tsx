import type { ReactNode } from "react";

/**
 * Shared card frame for the three decision charts (overhaul §3.4, §5):
 * title, honest description, printed period with timezone, one takeaway
 * line, the chart as role="img" with a headline aria-label, and a
 * visually-hidden data table as the accessible equivalent.
 */
export function DecisionChartFrame({
  titleId,
  title,
  description,
  periodLine,
  takeaway,
  chartLabel,
  empty,
  emptyMessage,
  tableCaption,
  tableHead,
  tableRows,
  span,
  children,
}: {
  titleId: string;
  title: string;
  description: string;
  periodLine: string;
  takeaway: string;
  chartLabel: string;
  empty: boolean;
  emptyMessage: string;
  tableCaption: string;
  tableHead: string[];
  tableRows: string[][];
  span: "col-6" | "col-12";
  children: ReactNode;
}) {
  return (
    <div className={span}>
      <section aria-labelledby={titleId} className="decision-chart-card">
        <h3 id={titleId} className="decision-chart-card__title">
          {title}
        </h3>
        <p className="decision-chart-card__description">{description}</p>
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
          </tbody>
        </table>
        <p className="decision-chart-card__takeaway">{takeaway}</p>
      </section>
    </div>
  );
}
