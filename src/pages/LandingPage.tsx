import { useEffect } from "react";
import { Link } from "react-router";
import { routes } from "../app/routes";
import { AnatomyExplorer } from "../components/public/AnatomyExplorer";
import { GrowthStepper } from "../components/public/GrowthStepper";
import { GuideGallery } from "../components/public/GuideGallery";
import { HistoryTimeline } from "../components/public/HistoryTimeline";
import { HowItWorks } from "../components/public/HowItWorks";
import { LegacyPaths } from "../components/public/LegacyPaths";
import { PhotoQuiz } from "../components/public/PhotoQuiz";
import { heroStats, landingSources } from "../components/public/publicContent";
import { fieldGuideEntries } from "../features/field-guide/entries";

const heroPhotos = ["healthy", "rust", "smut"].map((id) => {
  const entry = fieldGuideEntries.find((item) => item.id === id)!;
  return { photo: entry.images[0], label: entry.shortName };
});

export function LandingPage() {
  useEffect(() => {
    document.title = "CaneGuard | Learn the cane";
  }, []);

  return (
    <>
      <section className="pub-hero" aria-labelledby="pub-hero-title">
        <div className="pub-hero__grid">
          <div>
            <p className="pub-hero__pill">Nasugbu · Batangas · Sugarcane country</p>
            <h1 id="pub-hero-title">Learn the cane. Keep the legacy growing.</h1>
            <p>
              Find out how sugarcane grows, how to spot the five conditions our
              field team watches for, and how the next generation of farmers
              can keep Nasugbu&apos;s fields alive.
            </p>
            <div className="pub-hero__actions">
              <Link className="button pub-hero__primary" to={`${routes.home}#guide`}>
                Explore the Field Guide
              </Link>
              <Link className="button pub-hero__secondary" to={`${routes.home}#quiz`}>
                Take the quiz
              </Link>
            </div>
          </div>
          <div className="pub-hero__photos">
            {heroPhotos.map(({ photo, label }, i) => (
              <figure key={photo.src} className={`pub-specimen pub-specimen--${i + 1}`}>
                <img src={photo.src} alt={photo.caption} />
                <figcaption>{label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
        <dl className="pub-stats">
          {heroStats.map((stat) => (
            <div key={stat.label} className="pub-stat">
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="pub-ambient">
        <section id="guide" className="pub-section" aria-labelledby="guide-title">
          <h2 className="pub-section__title" id="guide-title">Know it before you report it</h2>
          <GuideGallery />
        </section>

        <section id="what" className="pub-section" aria-labelledby="what-title">
          <h2 className="pub-section__title" id="what-title">A giant grass that stores sunlight as sugar</h2>
          <p className="pub-lead">
            Sugarcane (<em>Saccharum</em> spp.) is a tall perennial grass. It is
            planted from stalk cuttings called setts, not from seed. Its stalks
            fill with sucrose, the mill crushes them for juice, and the leftover
            fibre, called bagasse, fuels the mill&apos;s boilers. After harvest the
            same stool regrows as a ratoon crop. Choose a part of the plant to see
            what to check there.
          </p>
          <AnatomyExplorer />
        </section>

        <section id="growth" className="pub-section" aria-labelledby="growth-title">
          <h2 className="pub-section__title" id="growth-title">One crop, four stages</h2>
          <GrowthStepper />
        </section>

        <section id="quiz" className="pub-section" aria-labelledby="quiz-title">
          <h2 className="pub-section__title" id="quiz-title">Which one is it?</h2>
          <PhotoQuiz />
        </section>

        <section id="history" className="pub-section" aria-labelledby="history-title">
          <h2 className="pub-section__title" id="history-title">Sugar and the Philippines</h2>
          <HistoryTimeline />
        </section>

        <section id="legacy" className="pub-section" aria-labelledby="legacy-title">
          <h2 className="pub-section__title" id="legacy-title">Ways to stay in cane, and grow with it</h2>
          <LegacyPaths />
        </section>

        <section id="how" className="pub-section" aria-labelledby="how-title">
          <h2 className="pub-section__title" id="how-title">From a phone photo to office follow-up</h2>
          <HowItWorks />
        </section>

        <section id="sources" className="pub-section" aria-labelledby="sources-title">
          <h2 className="pub-section__title" id="sources-title">Sources</h2>
          <ul className="pub-list">
            {landingSources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer noopener">
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
