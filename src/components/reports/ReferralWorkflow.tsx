import {
  FileText,
  MessageSquareText,
} from "lucide-react";
import { useState } from "react";
import { ApiError } from "../../api/ApiError";
import { env } from "../../config/env";
import { DetailField } from "../layout/Page";
import { Button } from "../ui/Button";
import { CappedDetailList } from "../ui/CappedDetailList";
import { ClampedText } from "../ui/ClampedText";
import { Modal } from "../ui/Modal";
import { confirmDiscardUnsavedChanges } from "../ui/confirmDiscard";
import { SelectFilter, TextArea } from "../ui/FormControls";
import {
  actionTakenLabels,
  activeAuthorityClassifiedConditions,
  authorityClassifiedConditionLabels,
  isLegacyAuthorityClassifiedCondition,
} from "../../domain/report.metadata";
import type {
  AuthorityClassifiedCondition,
  DiseaseReport,
  FindingSource,
  ReferralState,
  VerificationOutcome,
} from "../../domain/report.types";
import {
  useConfirmExpertReferral,
  useRecordExpertReferralResponse,
} from "../../hooks/useReports";
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
  const referral = report.referral;
  const referralState = report.lifecycle?.referralState ?? "not_referred";
  const existingLegacyAuthorityClassification = isLegacyAuthorityClassifiedCondition(
    report.authorityClassifiedCondition,
  )
    ? report.authorityClassifiedCondition
    : null;
  const [responseDate, setResponseDate] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [responseFinding, setResponseFinding] = useState("");
  const [responseFindingSource, setResponseFindingSource] = useState<FindingSource | "">("");
  const [responseAuthority, setResponseAuthority] = useState<
    AuthorityClassifiedCondition | null | undefined
  >(undefined);
  const [responseVerification, setResponseVerification] = useState<
    VerificationOutcome | "" | undefined
  >(undefined);
  const [responseSubmitted, setResponseSubmitted] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideMode, setOverrideMode] = useState(false);
  const [confirmSubmitted, setConfirmSubmitted] = useState(false);
  const [responseModalOpen, setResponseModalOpen] = useState(false);
  const responseDirty = Boolean(
    responseDate ||
    responseNote.trim() ||
    responseFinding.trim() ||
    responseFindingSource ||
    responseAuthority !== undefined ||
    responseVerification !== undefined,
  );
  const closeResponseModal = () => {
    if (confirmDiscardUnsavedChanges(responseDirty)) setResponseModalOpen(false);
  };
  const [notice, setNotice] = useState<string | null>(null);
  const recordResponse = useRecordExpertReferralResponse(report.uuid);
  const confirmReferral = useConfirmExpertReferral(report.uuid);

  const responseInputError =
    !responseDate
      ? "Add the expert response date."
      : !responseNote.trim() && !responseFinding.trim()
        ? "Add an expert response note or finding."
        : null;
  const responseFieldError = responseSubmitted ? responseInputError : null;
  const proposalNeedsDecision =
    referral?.status === "completed" && !referral.consultReviewOutcome;
  const overrideError = confirmSubmitted && !overrideNote.trim()
    ? "Add a reason before overriding the expert proposal."
    : null;

  const confirmProposal = async (outcome: "accepted" | "overridden") => {
    setConfirmSubmitted(true);
    setNotice(null);
    if (outcome === "overridden" && !overrideNote.trim()) return;
    if (report.reviewVersion === undefined) return;

    try {
      await confirmReferral.mutateAsync({
        consultReviewOutcome: outcome,
        ...(outcome === "overridden" ? { consultReviewNote: overrideNote } : {}),
        expectedVersion: report.reviewVersion,
      });
      setNotice(outcome === "accepted"
        ? "Expert proposal accepted. Save the office review to apply the office disposition."
        : "Expert proposal overridden. Save the office review to apply the office disposition.");
      setConfirmSubmitted(false);
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
        ...(responseFindingSource ? { findingSource: responseFindingSource } : {}),
        authorityClassifiedCondition: responseAuthority,
        verificationOutcome: responseVerification || undefined,
        expectedVersion: report.reviewVersion,
      });
      setNotice("Expert response recorded. Review the updated Staff-Classified Condition before closing the report.");
      setResponseModalOpen(false);
    } catch {
      return;
    }
  };

  // Referral creation now lives in the guided next-action panel. This section
  // only handles the pending referral and the expert response lifecycle.
  if (!referral) return null;

  return (
    <section className="review-card referral-workflow" aria-labelledby="referral-heading">
      <div className="section-heading">
        <div>
          <h2 id="referral-heading">Expert referral follow-up</h2>
        </div>
        <MessageSquareText aria-hidden="true" />
      </div>
      <p className="referral-state" role="status">
        <strong>{referralStateLabel(referralState)}</strong>
        {referralState === "referred"
          ? " Keep the case open until the expert response is recorded."
          : referralState === "expert_response_received"
            ? " Confirm the Staff-Classified Condition and verification outcome before closure."
            : " Referral is recorded as an office action, not a verification outcome."}
      </p>
      {notice ? <p className="success-banner referral-notice" role="status">{notice}</p> : null}

      <>
          <CappedDetailList className="detail-list referral-details" limit={4}>
            <DetailField label="Destination">{referral.destination}</DetailField>
            <DetailField label="Reference">{referral.reference}</DetailField>
            <DetailField label="Referral date">{referral.referralDate}</DetailField>
            <DetailField label="Response date">{referral.responseDate ?? "Pending"}</DetailField>
            <DetailField label="Status">{referral.status ?? (referral.responseDate ? "completed" : "pending")}</DetailField>
            <DetailField label="Due date">{referral.dueDate ?? "Not set"}</DetailField>
            <DetailField label="Expert">{referral.expertName ?? "Not attributed"}</DetailField>
            <DetailField label="Expert contact">{referral.expertContact ?? "Not provided"}</DetailField>
            <DetailField label="Referred by">{referral.referredBy?.name ?? "Not available"}</DetailField>
            <DetailField label="Referral note"><ClampedText text={referral.note ?? "Not provided"} /></DetailField>
          </CappedDetailList>
          <div className="referral-office-context">
            <strong>Office context captured at referral</strong>
            <span>
              {referral.officeContext.authorityClassifiedCondition
                ? authorityClassifiedConditionLabels[referral.officeContext.authorityClassifiedCondition]
                : "No Staff-Classified Condition"}
              {" · "}
              {verificationOutcomeLabels[referral.officeContext.verificationOutcome]}
              {" · "}
              {referral.officeContext.actionTaken
                ? actionTakenLabels[referral.officeContext.actionTaken]
                : "No office action"}
            </span>
            {referral.officeContext.notes ? <p><ClampedText text={referral.officeContext.notes} /></p> : null}
            {referral.officeContext.reviewedAt ? (
              <small>Captured {formatDateTime(referral.officeContext.reviewedAt)}</small>
            ) : null}
          </div>

          {proposalNeedsDecision ? (
            <div className="referral-form referral-proposal" aria-label="Expert proposal">
              <div className="referral-subheading">
                <FileText aria-hidden="true" />
                <div>
                  <strong>Expert proposal</strong>
                  <span>This is advisory input. The office must accept or override it before saving its own classification.</span>
                </div>
              </div>
              <dl className="detail-list referral-details">
                <DetailField label="Condition opinion">{referral.conditionOpinion ?? referral.findingDetails ?? "Not provided"}</DetailField>
                <DetailField label="Basis">{referral.findingDetails ?? "Not provided"}</DetailField>
                <DetailField label="Confidence">{referral.findingConfidence ?? "Not provided"}</DetailField>
                <DetailField label="Recommendation">{referral.findingRecommendation ?? "Not provided"}</DetailField>
              </dl>
              <div className="referral-confirm-actions">
                <Button
                  type="button"
                  icon={<FileText aria-hidden="true" />}
                  disabled={confirmReferral.isPending}
                  onClick={() => void confirmProposal("accepted")}
                >
                  Accept proposal
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={confirmReferral.isPending}
                  onClick={() => {
                    setOverrideMode(true);
                    setConfirmSubmitted(false);
                  }}
                >
                  Override proposal
                </Button>
              </div>
              {overrideMode ? (
                <>
                  <TextArea
                    id="consult-review-note"
                    label="Override reason"
                    rows={3}
                    maxLength={2000}
                    value={overrideNote}
                    onChange={(event) => {
                      setOverrideNote(event.target.value);
                      setConfirmSubmitted(false);
                      confirmReferral.reset();
                    }}
                    placeholder="Explain why the office is overriding the expert proposal"
                  />
                  {overrideError ? <p className="form-error" role="alert">{overrideError}</p> : null}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={confirmReferral.isPending}
                    onClick={() => void confirmProposal("overridden")}
                  >
                    Confirm override
                  </Button>
                </>
              ) : null}
              {confirmReferral.isError ? (
                <p className="form-error" role="alert">
                  {errorMessage(confirmReferral.error, "The office decision could not be saved. No proposal decision was confirmed.")}
                </p>
              ) : null}
            </div>
          ) : referralState === "referred" ? (
            <div className="referral-response-action">
              <Button
                type="button"
                icon={<FileText aria-hidden="true" />}
                onClick={() => setResponseModalOpen(true)}
              >
                Record expert response
              </Button>
              <Modal
                title="Record expert response"
                description="Findings are attributed to this consult. External findings entered by staff are labelled as transcribed."
                open={responseModalOpen}
                onClose={closeResponseModal}
                disabled={recordResponse.isPending}
                isDirty={responseDirty}
                footer={
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={recordResponse.isPending}
                      onClick={closeResponseModal}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={recordResponse.isPending}
                      onClick={() => void saveResponse()}
                    >
                      {recordResponse.isPending ? "Recording response..." : "Record expert response"}
                    </Button>
                  </>
                }
              >
                <div className="referral-form referral-response-form">
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
                    label={responseFindingSource === "transcribed" ? "Expert finding (transcribed; optional)" : "Expert finding (optional)"}
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
                    label="Finding source (optional)"
                    value={responseFindingSource}
                    onChange={(event) => {
                      setResponseFindingSource(event.target.value as FindingSource | "");
                      setResponseSubmitted(false);
                      recordResponse.reset();
                    }}
                  >
                    <option value="">Use transcribed source by default</option>
                    <option value="in_system">Entered in CaneGuard as part of this consult</option>
                    <option value="transcribed">Transcribed from an external expert response</option>
                  </SelectFilter>
                  <SelectFilter
                    label="Staff-Classified Condition after response"
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
                    {activeAuthorityClassifiedConditions.map((value) => (
                      <option value={value} key={value}>
                        {authorityClassifiedConditionLabels[value]}
                      </option>
                    ))}
                    {existingLegacyAuthorityClassification ? (
                      <option value={existingLegacyAuthorityClassification}>
                        {authorityClassifiedConditionLabels[existingLegacyAuthorityClassification]}
                        {" (legacy record; not offered for new review)"}
                      </option>
                    ) : null}
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
                </div>
              </Modal>
            </div>
          ) : (
            <div className="referral-response-summary">
              <strong>{referral.consultReviewOutcome ? "Expert proposal decision" : "Expert response"}</strong>
              {referral.consultReviewOutcome ? (
                <p className="referral-state">
                  Office decision: <strong>{referral.consultReviewOutcome}</strong>
                  {referral.consultReviewNote ? ` — ${referral.consultReviewNote}` : ""}
                </p>
              ) : null}
              <DetailField label="Response note"><ClampedText text={referral.responseNote ?? "Not provided"} /></DetailField>
              <DetailField label={referral.findingSource === "transcribed" ? "Finding (transcribed)" : "Response finding"}><ClampedText text={referral.responseFinding ?? referral.findingDetails ?? "Not provided"} /></DetailField>
              <DetailField label="Recommendation">{referral.findingRecommendation ?? "Not provided"}</DetailField>
              {referral.findingSource ? <small>Finding source: {referral.findingSource === "transcribed" ? "Transcribed from an external expert response" : "Entered in CaneGuard as part of this consult"}.</small> : null}
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
    </section>
  );
}
