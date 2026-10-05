import { Outlet } from "react-router";
import { useAuth } from "./useAuth";
import { ErrorState } from "../components/ui/States";

export function RequireAccountsAccess() {
  const { user } = useAuth();
  if (user?.role !== "admin" || !user.accounts_enabled || !user.capabilities?.includes("staff:manage")) {
    return <ErrorState message="Account management requires a current Manage staff key and an enabled office accounts service." />;
  }
  return <Outlet />;
}
