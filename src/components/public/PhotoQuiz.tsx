import { useState } from "react";
import { Link } from "react-router";
import "../../styles/public-learning.css";
import { routes } from "../../app/routes";
import { fieldGuideEntries } from "../../features/field-guide/entries";
import { quizQuestions } from "./quizQuestions";

/**
 * "Which one is it?" photo quiz framed as a frosted field bench.
 * Local state only; nothing is stored. Choice labels render `entry.shortName`
 * uniformly so no category spoiler is shown.
 */
export function PhotoQuiz() {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);

  const currentPos = index % quizQuestions.length;
  const question = quizQuestions[currentPos];
  const answer = fieldGuideEntries.find(
    (entry) => entry.id === question.entryId,
  )!;

  const choose = (id: string) => {
    if (picked) return;
    setPicked(id);
    setAnswered((count) => count + 1);
    if (id === question.entryId) setCorrect((count) => count + 1);
  };

  const next = () => {
    setIndex((value) => value + 1);
    setPicked(null);
  };

  return (
    <div className="pub-glass pub-glass--strong pub-quiz">
      <figure className="pub-quiz__media">
        <img src={question.src} alt="Quiz photo: identify what it shows" />
        <figcaption className="pub-quiz__badges">
          <span className="pub-quiz__badge">
            Photo {currentPos + 1} of {quizQuestions.length}
          </span>
          <span
            className="pub-quiz__badge pub-quiz__badge--score"
            aria-live="polite"
          >
            {answered === 0
              ? "Ready to score"
              : `${correct} of ${answered} correct`}
          </span>
        </figcaption>
      </figure>

      <div className="pub-quiz__body">
        <p className="pub-quiz__prompt">
          Look closely at the photo, then pick the matching entry.
        </p>
        <div className="pub-quiz__answers">
          {fieldGuideEntries.map((entry) => {
            const state =
              picked === null
                ? ""
                : entry.id === question.entryId
                  ? " pub-quiz__answer--right"
                  : entry.id === picked
                    ? " pub-quiz__answer--wrong"
                    : "";
            return (
              <button
                key={entry.id}
                type="button"
                className={`pub-quiz__answer${state}`}
                disabled={picked !== null && state === ""}
                onClick={() => choose(entry.id)}
              >
                {entry.shortName}
              </button>
            );
          })}
        </div>
        <p className="pub-quiz__feedback" aria-live="polite">
          {picked === null ? null : (
            <>
              <strong>
                {picked === question.entryId
                  ? "Correct. "
                  : `Not quite. It is ${answer.shortName}. `}
              </strong>
              {answer.quizCue}{" "}
              <Link to={routes.guideEntry(answer.id)}>
                Read the {answer.shortName} guide
              </Link>
            </>
          )}
        </p>
        <div className="pub-quiz__bar">
          <button
            type="button"
            className="button button--primary"
            onClick={next}
            disabled={picked === null}
          >
            Next photo
          </button>
        </div>
      </div>
    </div>
  );
}
