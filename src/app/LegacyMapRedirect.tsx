import { Navigate, useLocation } from "react-router";
import { routes } from "./routes";

/** The old standalone map now lives in Field visits; keep its filters and bookmarks. */
export function LegacyMapRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("view", "map");
  return <Navigate replace to={`${routes.monitoring}?${params.toString()}`} />;
}
