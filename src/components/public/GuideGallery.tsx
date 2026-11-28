import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useLocation } from "react-router";
import { routes } from "../../app/routes";
import {
  FIELD_GUIDE_CATEGORY_LABELS,
  fieldGuideEntries,
} from "../../features/field-guide/entries";
import type {
  FieldGuideCategory,
  FieldGuideEntry,
} from "../../features/field-guide/types";
import "../../styles/public-guide.css";

type Filter = "all" | FieldGuideCategory;
type TabId = "symptoms" | "prevention" | "management" | "why";

const filters: Filter[] = ["all", "healthy", "disease", "pest"];
const DEFAULT_SPECIMEN = "rust";

const tabs: { id: TabId; label: string }[] = [
  { id: "symptoms", label: "Symptoms" },
  { id: "prevention", label: "Prevention" },
  { id: "management", label: "Management" },
  { id: "why", label: "Why it matters" },
];

function BentoCardContent({ entry }: { entry: FieldGuideEntry }) {
  return (
    <>
      <span className="pub-bento__media">
        <img
          src={entry.images[0].src}
          alt={entry.images[0].caption}
          loading="lazy"
        />
        <span className="pub-bento__badge">{entry.conditionLabel}</span>
      </span>
      <span className="pub-bento__body">
        <strong>{entry.displayName}</strong>
        <span>{entry.summary}</span>
      </span>
    </>
  );
}

function TabPanelBody({ entry, tab }: { entry: FieldGuideEntry; tab: TabId }) {
  if (tab === "symptoms") {
    return (
      <>
        <ul className="pub-list">
          {entry.signs.map((sign) => (
            <li key={sign}>{sign}</li>
          ))}
        </ul>
        <p>{entry.whereToLook}</p>
      </>
    );
  }
  if (tab === "prevention") {
    return (
      <ul className="pub-list">
        {entry.prevention.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  if (tab === "management") {
    return (
      <ul className="pub-list">
        {entry.management.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p>{entry.impact}</p>;
}

function QuickInspect({ entry }: { entry: FieldGuideEntry }) {
  const baseId = useId();
  const [tab, setTab] = useState<TabId>("symptoms");
  const [photoIndex, setPhotoIndex] = useState(0);
  const photo = entry.images[photoIndex] ?? entry.images[0];

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`${baseId}-tab-${tabs[next].id}`)?.focus();
  };

  return (
    <section
      className="pub-glass pub-glass--strong pub-inspect"
      aria-labelledby={`${baseId}-title`}
    >
      <figure className="pub-inspect__photo">
        <img src={photo.src} alt={photo.caption} />
        <figcaption>{photo.caption}</figcaption>
        {entry.images.length > 1 ? (
          <div className="pub-inspect__thumbs" role="group" aria-label="Specimen photos">
            {entry.images.map((image, i) => (
              <button
                key={image.src}
                type="button"
                aria-pressed={i === photoIndex}
                aria-label={`Show photo: ${image.caption}`}
                onClick={() => setPhotoIndex(i)}
              >
                <img src={image.src} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </figure>

      <div className="pub-inspect__content">
        <h3 id={`${baseId}-title`}>{entry.displayName}</h3>
        {entry.scientificName ? (
          <p className="pub-inspect__sci">
            <em>{entry.scientificName}</em>
          </p>
        ) : null}
        <p>{entry.summary}</p>

        <div className="pub-inspect__tabs" role="tablist" aria-label="Specimen details">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              id={`${baseId}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`${baseId}-panel`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(event) => onTabKey(event, i)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div
          id={`${baseId}-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab}`}
          className="pub-inspect__panel"
        >
          <TabPanelBody entry={entry} tab={tab} />
        </div>

        <p className="pub-note">
          CaneGuard is decision support, not a diagnosis. If you suspect this,
          report it to your SRA district office and ask before any chemical
          treatment.
        </p>
        <Link className="pub-inspect__link" to={routes.guideEntry(entry.id)}>
          Open the full guide
        </Link>
      </div>
    </section>
  );
}

/**
 * Bento Field Guide gallery. On the landing page a card opens an inline
 * quick-inspect drawer; elsewhere each card links straight to its entry page.
 */
export function GuideGallery() {
  const { pathname } = useLocation();
  const inline = pathname === "/";
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_SPECIMEN);
  const visible = fieldGuideEntries.filter(
    (entry) => filter === "all" || entry.category === filter,
  );
  const selected =
    visible.find((entry) => entry.id === selectedId) ?? visible[0] ?? null;

  return (
    <div className="pub-bento-wrap">
      <div className="pub-bento-filter" role="group" aria-label="Filter entries">
        {filters.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "all"
              ? `All ${fieldGuideEntries.length}`
              : FIELD_GUIDE_CATEGORY_LABELS[value]}
          </button>
        ))}
      </div>
      <ul className="pub-bento">
        {visible.map((entry, index) => {
          const size = index < 2 ? "pub-bento__item--feature" : "pub-bento__item--compact";
          const isSelected = inline && selected?.id === entry.id;
          return (
            <li key={entry.id} className={`pub-bento__item ${size}`}>
              {inline ? (
                <button
                  type="button"
                  className="pub-bento__card"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <BentoCardContent entry={entry} />
                </button>
              ) : (
                <Link className="pub-bento__card" to={routes.guideEntry(entry.id)}>
                  <BentoCardContent entry={entry} />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {inline && selected ? <QuickInspect key={selected.id} entry={selected} /> : null}
    </div>
  );
}
