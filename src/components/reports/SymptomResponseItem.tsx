import { Check, HelpCircle, X } from "lucide-react";
import type { SymptomResponse } from "../../domain/report.types";

const answerLabels: Record<SymptomResponse["answer"], string> = {
  yes: "Yes",
  no: "No",
  not_sure: "Not sure",
};

export function SymptomResponseItem({ response }: { response: SymptomResponse }) {
  const Icon = response.answer === "yes" ? Check : response.answer === "no" ? X : HelpCircle;
  return (
    <li className="symptom-item">
      <span className={`symptom-item__icon symptom-item__icon--${response.answer}`}>
        <Icon aria-hidden="true" />
      </span>
      <span>{response.label}</span>
      <strong>{answerLabels[response.answer]}</strong>
    </li>
  );
}
