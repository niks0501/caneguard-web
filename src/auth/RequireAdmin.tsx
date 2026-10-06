import { Navigate, Outlet } from "react-router";
import { routes } from "../app/routes";
import { useAuth } from "./useAuth";

export function RequireAdmin() {
  const { user } = useAuth();
  return user?.role === "admin" ? <Outlet /> : <Navigate replace to={routes.dashboard} state={{ notice: "That section needs an Admin account." }} />;
}
