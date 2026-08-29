import {
  CalendarDays,
  FileText,
  MessageSquareText,
  Send,
} from "lucide-react";
import { useState } from "react";
import { ApiError } from "../../api/ApiError";
import { env } from "../../config/env";
import { DetailField } from "../layout/Page";
import { Button } from "../ui/Button";
import { SelectFilter, TextArea } from "../ui/FormControls";
import {
  actionTakenLabels,
  authorityClassifiedConditionLabels,
} from "../../domain/report.metadata";
import type {
  AuthorityClassifiedCondition,
  DiseaseReport,
  ReferralState,
  VerificationOutcome,
} from "../../domain/report.types";
import { useRecordExpertReferralResponse, useRecordReportReferral } from "../../hooks/useReports";
import { formatDateTime } from "../../lib/formatters";

const verificationOutcomeLabels: Record<VerificationOutcome, string> = {
  not_determined: "Not determined",
  verified: "Verified",
  unable_to_verify: "Unable to verify",
};

function referralStateLabel(state: ReferralState) {
  if (state === "referred") return "Awaiting expert input";
  if (state === "expert_response_received") return "Expert response received";
  return "Not referred";
}

function errorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null;
  if (error instanceof ApiError && error.status === 409) {
    return "This case changed while the referral was being saved. Refresh the report before trying again.";
  }
  if (error instanceof ApiError && error.status === 422) {
    return "The referral could not be saved. Check the required fields and current case state.";
  }
  return fallback;
}

export function ReferralWorkflow({ report }: { report: DiseaseReport }) {
  const lifecycle = report.lifecycle;
  const referral = report.referral;
  const referralState = lifecycle?.referralState ?? "not_referred";
  const caseState = lifecycle?.caseState ?? "open";
  const [destination, setDestination] = useState("");
  const [reference, setReference] = useState("");
  const [referralDate, setReferralDate] = useState("");
  const [referralNote, setReferralNote] = useState("");
  const [referralSubmitted, setReferralSubmitted] = useState(false);
  const [responseDate, setResponseDate] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [responseFinding, setResponseFinding] = useState("");
  const [responseAuthority, setResponseAuthority] = useState<
    AuthorityClassifiedCondition | null | undefined
  >(undefined);
  const [responseVerification, setResponseVerification] = useState<
    VerificationOutcome | "" | undefined
  >(undefined);
  const [responseSubmitted, setResponseSubmitted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const recordReferral = useRecordReportReferral(report.uuid);
  const recordResponse = useRecordExpertReferralResponse(report.uuid);

  const referralInputError =
    !destination.trim()
      ? "Add the expert destination."
      : !reference.trim()
        ? "Add the referral reference."
        : !referralDate
          ? "Add the referral date."
          : null;
  const referralFieldError = referralSubmitted ? referralInputError : null;
  const responseInputError =
    !responseDate
      ? "Add the expert response date."
      : !responseNote.trim() && !responseFinding.trim()
        ? "Add an expert response note or finding."
        : null;
  const responseFieldError = responseSubmitted ? responseInputError : null;

  const saveReferral = async () => {
    setReferralSubmitted(true);
    setNotice(null);
    if (referralInputError || report.reviewVersion === undefined) return;

    try {
      await recordReferral.mutateAsync({
        destination,
        reference,
        referralDate,
        note: referralNote,
        expectedVersion: report.reviewVersion,
      });
      setNotice("Expert referral recorded. The case remains open while input is pending.");
    } catch {
      return;
    }
  };

  const saveResponse = async () => {
    setResponseSubmitted(true);
    setNotice(null);
    if (responseInputError || report.reviewVersion === undefined) return;

    try {
      await recordResponse.mutateAsync({
        responseDate,
        responseNote,
        responseFinding,
        authorityClassifiedCondition: responseAuthority,
        verificationOutcome: responseVerification || undefined,
        expectedVersion: report.reviewVersion,
      });
      setNotice("Expert response recorded. Review the updated authority finding before closing the case.");
    } catch {
      return;
    }
  };

  return (
    <section className="review-card referral-workflow" aria-labelledby="referral-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Expert follow-up</p>
          <h2 id="referral-heading">Referral lifecycle</h2>
        </div>
        <MessageSquareText aria-hidden="true" />
      </div>
      <p className="referral-state" role="status">
        <strong>{referralStateLabel(referralState)}</strong>
        {referralState === "referred"
          ? " Keep the case open until the expert response is recorded."
          : referralState === "expert_response_received"
            ? " Confirm the authority finding and verification outcome before closure."
            : " Referral is recorded as an office action, not a verification outcome."}
      </p>
      {notice ? <p className="success-banner referral-notice" role="status">{notice}</p> : null}

      {!referral && caseState === "open" ? (
        <div className="referral-form">
          <p className="authority-classification-help">
            Capture the external handoff as plain operational text. CaneGuard does not send the referral or connect to an external SRA account.
          </p>
          <label className="select-filter" htmlFor="referral-destination">
            <span>Expert destination</span>
            <input
              id="referral-destination"
              value={destination}
              maxLength={160}
              onChange={(event) => {
                setDestination(event.target.value);
                setReferralSubmitted(false);
                recordReferral.reset();
              }}
              placeholder="Office, laboratory, or expert group"
            />
          </label>
          <label className="select-filter" htmlFor="referral-reference">
            <span>Referral reference</span>
            <input
              id="referral-reference"
              value={reference}
              maxLength={160}
              onChange={(event) => {
                setReference(event.target.value);
                setReferralSubmitted(false);
                recordReferral.reset();
              }}
              placeholder="Reference supplied by the receiving office"
            />
          </label>
          <label className="select-filter" htmlFor="referral-date">
            <span>Referral date</span>
            <input
              id="referral-date"
              type="date"
              value={referralDate}
              onChange={(event) => {
                setReferralDate(event.target.value);
                setReferralSubmitted(false);
                recordReferral.reset();
              }}
            />
          </label>
          <TextArea
            id="referral-note"
            label="Referral note (optional)"
            hint="Keep the request neutral and grounded in the submitted evidence."
            rows={3}
            maxLength={1000}
            value={referralNote}
            onChange={(event) => {
              setReferralNote(event.target.value);
              setReferralSubmitted(false);
              recordReferral.reset();
            }}
            placeholder="What should the expert review?"
          />
          {referralFieldError ? <p className="form-error" role="alert">{referralFieldError}</p> : null}
          {errorMessage(recordReferral.error, "The referral service is unavailable. No referral change was confirmed.") ? (
            <p className="form-error" role="alert">
              {errorMessage(recordReferral.error, "The referral service is unavailable. No referral change was confirmed.")}
            </p>
          ) : null}
          <Button
            type="button"
            icon={<Send aria-hidden="true" />}
            disabled={recordReferral.isPending}
            onClick={() => void saveReferral()}
          >
            {recordReferral.isPending ? "Recording referral..." : "Record expert referral"}
          </Button>
        </div>
      ) : null}

      {!referral && caseState !== "open" ? (
        <p className="authority-classification-help">
          This case is closed. A new expert referral cannot be recorded.
        </p>
      ) : null}

      {referral ? (
        <>
          <dl className="detail-list referral-details">
            <DetailField label="Destination">{referral.destination}</DetailField>
            <DetailField label="Reference">{referral.reference}</DetailField>
            <DetailField label="Referral date">{referral.referralDate}</DetailField>
            <DetailField label="Referred by">{referral.referredBy?.name ?? "Not available"}</DetailField>
            <DetailField label="Referral note">{referral.note ?? "Not provided"}</DetailField>
            <DetailField label="Response date">{referral.responseDate ?? "Pending"}</DetailField>
          </dl>
          <div className="referral-office-context">
            <strong>Office context captured at referral</strong>
            <span>
              {referral.officeContext.authorityClassifiedCondition
                ? authorityClassifiedConditionLabels[referral.officeContext.authorityClassifiedCondition]
                : "No authority finding"}
              {" · "}
              {verificationOutcomeLabels[referral.officeContext.verificationOutcome]}
              {" · "}
              {referral.officeContext.actionTaken
                ? actionTakenLabels[referral.officeContext.actionTaken]
                : "No office action"}
            </span>
            {referral.officeContext.notes ? <p>{referral.officeContext.notes}</p> : null}
            {referral.officeContext.reviewedAt ? (
              <small>Captured {formatDateTime(referral.officeContext.reviewedAt)}</small>
            ) : null}
          </div>

          {referralState === "referred" ? (
            <div className="referral-form referral-response-form">
              <div className="referral-subheading">
                <CalendarDays aria-hidden="true" />
                <div>
                  <strong>Record expert response</strong>
                  <span>Response evidence is separate from the original AI result.</span>
                </div>
              </div>
              <label className="select-filter" htmlFor="response-date">
                <span>Expert response date</span>
                <input
                  id="response-date"
                  type="date"
                  value={responseDate}
                  onChange={(event) => {
                    setResponseDate(event.target.value);
                    setResponseSubmitted(false);
                    recordResponse.reset();
                  }}
                />
              </label>
              <TextArea
                id="response-note"
                label="Expert response note"
                rows={3}
                maxLength={1000}
                value={responseNote}
                onChange={(event) => {
                  setResponseNote(event.target.value);
                  setResponseSubmitted(false);
                  recordResponse.reset();
                }}
                placeholder="Record the response received from the expert"
              />
              <TextArea
                id="response-finding"
                label="Expert finding (optional)"
                rows={3}
                maxLength={2000}
                value={responseFinding}
                onChange={(event) => {
                  setResponseFinding(event.target.value);
                  setResponseSubmitted(false);
                  recordResponse.reset();
                }}
                placeholder="Capture the expert's finding as reported"
              />
              <SelectFilter
                label="Authority finding after response"
                value={responseAuthority ?? ""}
                onChange={(event) => {
                  setResponseAuthority(
                    (event.target.value || undefined) as AuthorityClassifiedCondition | undefined,
                  );
                  setResponseSubmitted(false);
                  recordResponse.reset();
                }}
              >
                <option value="">Keep or leave unclassified</option>
                {Object.entries(authorityClassifiedConditionLabels).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </SelectFilter>
              <SelectFilter
                label="Verification outcome after response"
                value={responseVerification ?? ""}
                onChange={(event) => {
                  setResponseVerification(event.target.value as VerificationOutcome | "");
                  setResponseSubmitted(false);
                  recordResponse.reset();
                }}
              >
                <option value="">Keep current outcome</option>
                {Object.entries(verificationOutcomeLabels).map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </SelectFilter>
              {responseFieldError ? <p className="form-error" role="alert">{responseFieldError}</p> : null}
              {errorMessage(recordResponse.error, "The expert response service is unavailable. No response change was confirmed.") ? (
                <p className="form-error" role="alert">
                  {errorMessage(recordResponse.error, "The expert response service is unavailable. No response change was confirmed.")}
                </p>
              ) : null}
              <Button
                type="button"
                icon={<FileText aria-hidden="true" />}
                disabled={recordResponse.isPending}
                onClick={() => void saveResponse()}
              >
                {recordResponse.isPending ? "Recording response..." : "Record expert response"}
              </Button>
            </div>
          ) : (
            <div className="referral-response-summary">
              <strong>Expert response</strong>
              <DetailField label="Response note">{referral.responseNote ?? "Not provided"}</DetailField>
              <DetailField label="Response finding">{referral.responseFinding ?? "Not provided"}</DetailField>
              {referral.responseRecordedBy ? (
                <small>Recorded by {referral.responseRecordedBy.name}{referral.responseRecordedAt ? ` on ${formatDateTime(referral.responseRecordedAt)}` : ""}.</small>
              ) : null}
            </div>
          )}
          <a
            className="button button--secondary referral-summary-link"
            href={`${env.apiBaseUrl}/api/v1/reports/${encodeURIComponent(report.uuid)}/referral/summary`}
            target="_blank"
            rel="noreferrer"
          >
            <FileText aria-hidden="true" />
            <span>Print / download referral summary</span>
          </a>
        </>
      ) : null}
    </section>
  );
}
