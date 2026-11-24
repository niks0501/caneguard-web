import { Navigate } from "react-router";
import { routes } from "../app/routes";

/** Admin settings now live under Workspace in Settings; old links land there. */
export function AdminSettingsPage() {
  return <Navigate replace to={`${routes.settings}#weekly-reporting`} />;
}
