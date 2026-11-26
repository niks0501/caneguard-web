import { GitBranch } from "lucide-react";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import type { CanonicalCaseLink } from "../../domain/report.types";
import { useUnlinkDuplicateReport } from "../../hooks/useReports";
import { formatDateTime } from "../../lib/formatters";
import { Button } from "../ui/Button";
import { duplicateUnlinkErrorMessage } from "./duplicateLinkMessages";

interface DuplicateLinkedBannerProps {
  reportId: string;
  reviewVersion: number | undefined;
  linkage: CanonicalCaseLink;
  /** One short line saying why the link cannot change; disables removal. */
  blockedMessage?: string | null;
  onRemoved: () => void;
}

/** Shown at the top of a case that is already marked as a duplicate. */
export function DuplicateLinkedBanner({
  reportId,
  reviewVersion,
  linkage,
  blockedMessage = null,
  onRemoved,
}: DuplicateLinkedBannerProps) {
  const unlink = useUnlinkDuplicateReport(reportId);
  const original = linkage.canonicalCase;
  const errorMessage = duplicateUnlinkErrorMessage(unlink.error);

  const remove = async () => {
    if (reviewVersion === undefined) return;
    try {
      await unlink.mutateAsync({ expectedVersion: reviewVersion });
      onRemoved();
    } catch {
      return;
    }
  };

  return (
    <section className="duplicate-banner" aria-labelledby="duplicate-banner-heading" role="status">
      <GitBranch aria-hidden="true" className="duplicate-banner__icon" />
      <div className="duplicate-banner__body">
        <h2 id="duplicate-banner-heading">
          Marked as duplicate of{" "}
          {original ? (
            <Link to={routes.reportDetail(original.uuid)}>{original.referenceCode}</Link>
          ) : (
            "another case"
          )}
        </h2>
        {linkage.linkedBy || linkage.linkedAt ? (
          <p className="duplicate-banner__meta">
            {linkage.linkedBy ? `Linked by ${linkage.linkedBy.name}` : "Linked"}
            {linkage.linkedAt ? ` · ${formatDateTime(linkage.linkedAt)}` : ""}
          </p>
        ) : null}
        {linkage.reason ? <p className="duplicate-banner__meta">Reason: {linkage.reason}</p> : null}
        <p className="duplicate-banner__meta">
          This submission and its photo stay preserved. Follow-up belongs on the original case.
        </p>
        {blockedMessage ? (
          <p id="duplicate-banner-blocked" className="duplicate-banner__blocked">{blockedMessage}</p>
        ) : null}
        {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={unlink.isPending || Boolean(blockedMessage)}
        aria-describedby={blockedMessage ? "duplicate-banner-blocked" : undefined}
        onClick={remove}
      >
        {unlink.isPending ? "Removing link..." : "Remove duplicate link"}
      </Button>
    </section>
  );
}
