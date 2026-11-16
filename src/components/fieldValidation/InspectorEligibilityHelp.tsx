import { use } from "react";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import { AuthContext } from "../../auth/auth.context";

/** The one explanation of who can be picked, shared by every assign control. */
export function InspectorEligibilityHelp({ id, loaded, empty }: { id: string; loaded: boolean; empty: boolean }) {
  const isAdmin = use(AuthContext)?.user?.role === "admin";
  return (
    <p id={id} className="field-operations-editor__help">
      {loaded && empty ? <strong>No eligible inspectors yet. </strong> : null}
      Only inspectors who have set their password and are admitted appear here.
      {isAdmin ? <> <Link to={routes.accounts}>Manage field accounts</Link></> : null}
    </p>
  );
}
