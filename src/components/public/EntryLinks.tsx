import { Link } from "react-router";
import { routes } from "../../app/routes";
import { findFieldGuideEntry } from "../../features/field-guide/entries";
import type { FieldGuideLaunchEntryId } from "../../features/field-guide/types";

/** Chips that link to the Field Guide entries a teaching block points at. */
export function EntryLinks({
  ids,
}: {
  ids: readonly FieldGuideLaunchEntryId[];
}) {
  return (
    <ul className="pub-chips">
      {ids.map((id) => {
        const entry = findFieldGuideEntry(id);
        if (!entry) return null;
        return (
          <li key={id}>
            <Link className="pub-chip pub-chip--link" to={routes.guideEntry(id)}>
              {entry.shortName}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
