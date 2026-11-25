import { useState } from "react";
import { EntryLinks } from "./EntryLinks";
import { growthStages } from "./publicContent";

/** Four-stage growth cycle: a tab list with one panel for the chosen stage. */
export function GrowthStepper() {
  const [index, setIndex] = useState(0);
  const stage = growthStages[index];

  return (
    <div className="pub-growth">
      <ol className="pub-stages" aria-label="Growth stages">
        {growthStages.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              className={`pub-stage pub-stage--${i + 1}`}
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
            >
              <strong>
                {i + 1}. {item.name}
              </strong>
              <span>{item.window}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="pub-card" aria-live="polite">
        <p className="pub-card__label">{stage.window}</p>
        <h3>{stage.name}</h3>
        <p>{stage.text}</p>
        <p>
          <strong>Do:</strong> {stage.doThis}
        </p>
        <p className="pub-card__label">Watch for</p>
        <EntryLinks ids={stage.watchFor} />
      </div>
      <p className="pub-note">
        Months are approximate and change with variety and planting date. Ask
        the SRA office for your block&apos;s calendar.
      </p>
    </div>
  );
}
