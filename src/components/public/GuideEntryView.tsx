import { useState } from "react";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import { sourcesForEntry } from "../../features/field-guide/sources";
import type { FieldGuideEntry, FieldGuideImage } from "../../features/field-guide/types";

function creditLine(image: FieldGuideImage): string {
  if (image.credit.recorded && image.credit.attribution) {
    return image.credit.attribution;
  }
  return image.credit.creator
    ? `Photo: ${image.credit.creator}. Licence details pending.`
    : "Photo credit pending.";
}

function List({ items }: { items: readonly string[] }) {
  return (
    <ul className="pub-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** One Field Guide entry: photos, symptoms, prevention, management, sources. */
export function GuideEntryView({ entry }: { entry: FieldGuideEntry }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photo = entry.images[photoIndex];
  const sources = sourcesForEntry(entry.sourceIds);

  return (
    <article className="pub-entry">
      <nav className="pub-crumbs" aria-label="Breadcrumb">
        <Link to={routes.guide}>Field Guide</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{entry.shortName}</span>
      </nav>

      <header className="pub-entry__head">
        <div>
          <span className="pub-chip">{entry.conditionLabel}</span>
          <h1>{entry.displayName}</h1>
          {entry.scientificName ? (
            <p className="pub-entry__sci">
              <em>{entry.scientificName}</em>
            </p>
          ) : null}
          <p>{entry.summary}</p>
        </div>
        <figure className="pub-entry__photo">
          <img src={photo.src} alt={photo.caption} />
          <figcaption>{photo.caption}</figcaption>
          <p className="pub-note pub-entry__credit">{creditLine(photo)}</p>
          {entry.images.length > 1 ? (
            <div className="pub-entry__thumbs" role="group" aria-label="Photos">
              {entry.images.map((image, i) => (
                <button
                  key={image.src}
                  type="button"
                  aria-pressed={i === photoIndex}
                  aria-label={image.caption}
                  onClick={() => setPhotoIndex(i)}
                >
                  <img src={image.src} alt="" />
                </button>
              ))}
            </div>
          ) : null}
        </figure>
      </header>

      <div className="pub-grid pub-grid--2">
        <section className="pub-card" aria-labelledby="entry-signs">
          <h2 id="entry-signs">Symptoms</h2>
          <List items={entry.signs} />
          <p className="pub-card__label">Where to look</p>
          <p>{entry.whereToLook}</p>
        </section>
        <section className="pub-card" aria-labelledby="entry-impact">
          <h2 id="entry-impact">Why it matters</h2>
          <p>{entry.impact}</p>
          <p>{entry.detail}</p>
        </section>
        <section className="pub-card" aria-labelledby="entry-prevention">
          <h2 id="entry-prevention">Prevention</h2>
          <List items={entry.prevention} />
        </section>
        <section className="pub-card" aria-labelledby="entry-management">
          <h2 id="entry-management">Management</h2>
          <List items={entry.management} />
        </section>
      </div>

      <section className="pub-guide" aria-labelledby="entry-guide">
        <h2 id="entry-guide">The full guide</h2>
        <p>{entry.guide.intro}</p>
        {entry.guide.sections.map((section) => (
          <details key={section.id} className="pub-details">
            <summary>{section.heading}</summary>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </details>
        ))}
      </section>

      <section aria-labelledby="entry-sources">
        <h2 id="entry-sources">Sources</h2>
        <ul className="pub-list">
          {sources.map((source) => (
            <li key={source.id}>
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer noopener">
                  {source.title}
                </a>
              ) : (
                <span>{source.title}</span>
              )}
              {" · "}
              {source.publisher}
              {source.availability === "awaiting-supply"
                ? ". Not supplied to this guide yet."
                : null}
              <span className="pub-note"> {source.supports}</span>
            </li>
          ))}
        </ul>
        <p className="pub-note">
          Content version {entry.contentVersion}. If you suspect this, report it
          to your SRA district office. CaneGuard is decision support, not a
          diagnosis. Ask the office before any chemical treatment.
        </p>
      </section>
    </article>
  );
}
