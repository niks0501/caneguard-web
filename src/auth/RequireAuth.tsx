import { Navigate, Outlet, useLocation } from "react-router";
import { routes } from "../app/routes";
import { Button } from "../components/ui/Button";
import { ErrorState, LoadingState } from "../components/ui/States";
import { useAuth } from "./useAuth";

export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === "loading") {
    return (
      <div className="auth-state">
        <LoadingState message="Restoring your secure session..." />
      </div>
    );
  }

  if (auth.status === "service_error") {
    return (
      <div className="auth-state">
        <ErrorState
          message="CaneGuard could not confirm your session or complete sign-out because the service is unavailable. You have not been logged out."
          onRetry={() => auth.restoreSession()}
        />
        <Button type="button" variant="quiet" onClick={() => auth.logout()}>
          Retry sign out
        </Button>
      </div>
    );
  }

  if (auth.status === "unauthenticated") {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        replace
        to={routes.login}
        state={{ from, reason: auth.reason }}
      />
    );
  }

  return <Outlet />;
}
