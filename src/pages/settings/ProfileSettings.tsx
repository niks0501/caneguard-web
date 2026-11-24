import { Copy } from "lucide-react";
import { useAuth } from "../../auth/useAuth";

export function ProfileSettings() {
  const user = useAuth().user;
  const roleLabel = user?.role === "admin" ? "District Mill Officer" : "Reviewer";
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "CG";

  return (
    <section className="settings-card settings-card--profile" aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="sr-only">Account profile</h2>
      <div className="settings-identity">
        <div className="avatar avatar--large" aria-hidden="true">{initials}</div>
        <div className="settings-identity__text">
          <strong className="settings-identity__name">{user?.name ?? "Unavailable"}</strong>
          <span className="settings-identity__email">{user?.email ?? "Unavailable"}</span>
        </div>
        <span className="settings-role-badge">{roleLabel}</span>
      </div>
      <dl className="settings-facts">
        <div>
          <dt>Workspace</dt>
          <dd>SRA Don Pedro Workspace</dd>
        </div>
        <div>
          <dt>User ID</dt>
          <dd>
            <span className="machine-text settings-uid" title={user?.uuid}>{user?.uuid ?? "Unavailable"}</span>
            {user?.uuid ? (
              <button
                type="button"
                className="settings-copy"
                aria-label="Copy user ID"
                onClick={() => void navigator.clipboard?.writeText(user.uuid)}
              >
                <Copy aria-hidden="true" />
              </button>
            ) : null}
          </dd>
        </div>
      </dl>
      <p className="settings-card__description settings-card__description--flush">
        Role privileges are managed by office administrators.
      </p>
    </section>
  );
}
