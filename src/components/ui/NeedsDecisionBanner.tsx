import { Button } from "./Button";

export function NeedsDecisionBanner({ targetId }: { targetId: string }) {
  return (
    <div className="needs-decision-banner">
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
        Go to decision
      </Button>
    </div>
  );
}
