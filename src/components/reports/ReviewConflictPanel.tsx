import { useId, useState } from "react";
import type {
  AuthorityClassifiedCondition,
  DiseaseReport,
  VerificationOutcome,
} from "../../domain/report.types";
import {
  authorityClassifiedConditionLabels,
  verificationOutcomeLabels,
} from "../../domain/report.metadata";
import { Button } from "../ui/Button";
import {
  conflictFields,
  parseActionToken,
  savedReviewSnapshot,
  type ConflictChoices,
  type ConflictField,
  type ConflictSnapshot,
} from "./reviewConflict";

const fieldLabels: Record<ConflictField, string> = {
  classification: "Staff-Classified Condition",
  verification: "Verification Outcome",
  action: "Next action",
  notes: "Review notes",
  inspector: "Field Inspector",
  targetDate: "Target visit date",
};

const actionLabels: Record<string, string> = {
  field: "Needs Field Validation",
  support: "Provide Advisory or Assistance",
  close: "No Further Action",
};

function displayValue(
  field: ConflictField,
  value: string,
  inspectorNames: Record<string, string>,
  advisoryNames: Record<string, string>,
) {
  switch (field) {
    case "classification":
      return value
        ? authorityClassifiedConditionLabels[value as AuthorityClassifiedCondition] ?? value
        : "Not classified";
    case "verification":
      return verificationOutcomeLabels[value as VerificationOutcome] ?? value;
    case "action": {
      const selection = parseActionToken(value);
      const action = actionLabels[selection.action] ?? "No action selected";
      if (selection.action !== "support") return action;
      if (selection.support === "technical") return `${action} — Technical Assistance`;
      const advisory = advisoryNames[selection.advisoryUuid]
        ?? (selection.advisoryUuid ? "Selected advisory" : "No advisory selected");
      return `${action} — Advisory Guidance · ${advisory}`;
    }
    case "notes":
      return value ? value : "No notes";
    case "inspector":
      return value ? inspectorNames[value] ?? "Selected Field Inspector" : "Not assigned";
    case "targetDate":
      return value || "No target date";
  }
}

const allLatest: ConflictChoices = {
  classification: "latest",
  verification: "latest",
  action: "latest",
  notes: "latest",
  inspector: "latest",
  targetDate: "latest",
};

export function ReviewConflictPanel({
  latest,
  draft,
  inspectorNames,
  advisoryNames,
  loading,
  error,
  onLoadLatest,
  onApply,
  onReloadAll,
}: {
  latest: DiseaseReport | null;
  draft: ConflictSnapshot;
  inspectorNames: Record<string, string>;
  advisoryNames: Record<string, string>;
  loading: boolean;
  error: string | null;
  onLoadLatest: () => void;
  onApply: (choices: ConflictChoices) => void;
  onReloadAll: () => void;
}) {
  const idPrefix = useId();
  const [choices, setChoices] = useState<ConflictChoices>(allLatest);

  if (!latest) {
    return (
      <div className="review-conflict" role="alert">
        <p>
          Another reviewer saved this report after you opened it. Your draft is
          still here and nothing has been submitted.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <Button type="button" variant="secondary" disabled={loading} onClick={onLoadLatest}>
          {loading ? "Loading the latest version..." : error ? "Try loading the latest version again" : "Compare with the latest saved version"}
        </Button>
      </div>
    );
  }

  const saved = savedReviewSnapshot(latest);
  const differing = conflictFields.filter((field) => saved[field] !== draft[field]);

  return (
    <div className="review-conflict" role="alert">
      <p>
        Another reviewer saved this report after you opened it. Choose which
        value each field keeps before you confirm the review again.
      </p>
      {differing.length === 0 ? (
        <p>Your draft already matches the latest saved values. Confirm the review again to save it against the latest version.</p>
      ) : (
        <div className="review-conflict__scroll">
          <table className="review-conflict__table">
            <caption className="sr-only">Fields that changed on the server</caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Latest saved</th>
                <th scope="col">Your draft</th>
                <th scope="col">Keep</th>
              </tr>
            </thead>
            <tbody>
              {differing.map((field) => (
                <tr key={field}>
                  <th scope="row">{fieldLabels[field]}</th>
                  <td>{displayValue(field, saved[field], inspectorNames, advisoryNames)}</td>
                  <td>{displayValue(field, draft[field], inspectorNames, advisoryNames)}</td>
                  <td>
                    <fieldset className="review-conflict__choice">
                      <legend className="sr-only">Keep which value for {fieldLabels[field]}</legend>
                      <label>
                        <input
                          type="radio"
                          name={`${idPrefix}-${field}`}
                          checked={choices[field] === "latest"}
                          onChange={() => setChoices((current) => ({ ...current, [field]: "latest" }))}
                        />
                        <span>Latest</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name={`${idPrefix}-${field}`}
                          checked={choices[field] === "mine"}
                          onChange={() => setChoices((current) => ({ ...current, [field]: "mine" }))}
                        />
                        <span>Mine</span>
                      </label>
                    </fieldset>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="review-conflict__actions">
        <Button type="button" onClick={() => onApply(choices)}>
          {differing.length === 0 ? "Use the latest version" : "Apply these choices"}
        </Button>
        <Button type="button" variant="secondary" onClick={onReloadAll}>
          Reload and discard my changes
        </Button>
      </div>
    </div>
  );
}
