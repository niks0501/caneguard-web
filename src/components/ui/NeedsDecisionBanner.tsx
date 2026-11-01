import { Button } from "./Button";

/** One quiet line that names the pending decision and moves to it. */
export function NeedsDecisionBanner({
  targetId,
  label = "Needs decision",
  actionLabel = "Go to decision",
}: {
  targetId: string;
  label?: string;
  actionLabel?: string;
}) {
  return (
    <div className="needs-decision-banner" role="status">
      <strong>{label}</strong>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          const target = document.getElementById(targetId);
          if (!target) return;
          target.scrollIntoView({ block: "start" });
          target.focus({ preventScroll: true });
        }}
      >
        {actionLabel}
      </Button>
    </div>
  );
}
