import { useState } from "react";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import {
  FIELD_GUIDE_CATEGORY_LABELS,
  fieldGuideEntries,
} from "../../features/field-guide/entries";
import type { FieldGuideCategory } from "../../features/field-guide/types";

type Filter = "all" | FieldGuideCategory;

const filters: Filter[] = ["all", "healthy", "disease", "pest"];

/** Field Guide cards with category filters; each card links to its entry page. */
export function GuideGallery() {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = fieldGuideEntries.filter(
    (entry) => filter === "all" || entry.category === filter,
  );

  return (
    <div>
      <div className="pub-chips" role="group" aria-label="Filter entries">
        {filters.map((value) => (
          <button
            key={value}
            type="button"
            className="pub-chip pub-chip--button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "all"
              ? `All ${fieldGuideEntries.length}`
              : FIELD_GUIDE_CATEGORY_LABELS[value]}
          </button>
        ))}
      </div>
      <ul className="pub-grid pub-grid--cards">
        {visible.map((entry) => (
          <li key={entry.id}>
            <Link className="pub-gcard" to={routes.guideEntry(entry.id)}>
              <img
                src={entry.images[0].src}
                alt={entry.images[0].caption}
                loading="lazy"
              />
              <span className="pub-gcard__body">
                <span className="pub-chip">{entry.conditionLabel}</span>
                <strong>{entry.displayName}</strong>
                <span>{entry.summary}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
