import { Menu } from "lucide-react";
import type { RefObject } from "react";
import { useAuth } from "../../auth/useAuth";
import type { RealtimeStatus } from "../../hooks/useRealtimeInvalidation";
import { NotificationBell } from "./NotificationBell";
import { RealtimeStatus as RealtimeStatusIndicator } from "./RealtimeStatus";
import { ServerStatus } from "./ServerStatus";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export function AppHeader({
  onOpenMenu,
  menuButtonRef,
  realtimeStatus = "disabled",
}: {
  onOpenMenu: () => void;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
  realtimeStatus?: RealtimeStatus;
}) {
  const auth = useAuth();

  return (
    <header className="app-header">
      <div className="app-header__context">
        <button
          ref={menuButtonRef}
          className="header-icon header-icon--menu"
          type="button"
          aria-label="Open navigation"
          onClick={onOpenMenu}
        >
          <Menu aria-hidden="true" />
        </button>
        <div>
          <span>SRA Don Pedro</span>
          <strong>Case monitoring workspace</strong>
        </div>
      </div>
      <div className="app-header__actions">
        <ServerStatus showOnlyDegraded />
        <RealtimeStatusIndicator status={realtimeStatus} />
        <NotificationBell enabled={auth.status === "authenticated"} />
        <span className="avatar" aria-label={auth.user?.name}>
          {initials(auth.user?.name ?? "CaneGuard user")}
        </span>
      </div>
    </header>
  );
}
