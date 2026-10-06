import { Navigate, Outlet } from "react-router";
import { routes } from "../app/routes";
import { useAuth } from "./useAuth";

export function RequireWebRole() {
  const { user } = useAuth();
  return user && (user.role === "reviewer" || user.role === "admin") && user.is_active !== false
    ? <Outlet /> : <Navigate replace to={routes.login} state={{ reason: user?.is_active === false ? "account_disabled" : "access_denied" }} />;
}
