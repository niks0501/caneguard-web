import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, ShieldCheck, Sprout } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { ApiError } from "../api/ApiError";
import { routes } from "../app/routes";
import { WebRoleError } from "../auth/auth.api";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/ui/Button";
import { LoadingState } from "../components/ui/States";

type LoginLocationState = {
  from?: unknown;
  reason?: unknown;
};

function safeDestination(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith(routes.login)
  ) {
    return routes.dashboard;
  }

  return value;
}

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = (location.state ?? {}) as LoginLocationState;
  const destination = safeDestination(routeState.from);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (auth.status === "loading") {
    return (
      <main className="login-page">
        <LoadingState message="Checking your CaneGuard session..." />
      </main>
    );
  }

  if (auth.status === "authenticated") {
    return <Navigate replace to={destination} />;
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await auth.login({ email, password });
      navigate(destination, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrorMessage("The email or password is incorrect.");
      } else if (error instanceof ApiError && error.status === 429) {
        setErrorMessage(
          "Too many sign-in attempts. Wait a minute before trying again.",
        );
      } else if (
        (error instanceof ApiError && error.status === 403) ||
        error instanceof WebRoleError
      ) {
        setErrorMessage("This account cannot access the web workspace.");
      } else {
        setErrorMessage(
          "The CaneGuard service is unavailable. Your session status has not been changed.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const routeMessage =
    routeState.reason === "session_expired"
      ? "Your session expired. Sign in again to continue where you left off."
      : routeState.reason === "access_denied"
        ? "This account is not authorized for the municipal web workspace."
        : null;

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-heading">
        <div className="login-brand">
          <span className="brand__mark">
            <Sprout aria-hidden="true" />
          </span>
          <div>
            <strong>CaneGuard</strong>
            <span>Municipal agriculture workspace</span>
          </div>
        </div>

        <div className="login-copy">
          <span className="login-icon"><ShieldCheck aria-hidden="true" /></span>
          <p className="eyebrow">Secure staff access</p>
          <h1 id="login-heading">Sign in to review field reports</h1>
          <p>Use your municipal reviewer or administrator account.</p>
        </div>

        {routeMessage ? (
          <p className="login-notice" role="status">{routeMessage}</p>
        ) : null}
        {auth.status === "service_error" ? (
          <p className="login-notice login-notice--error" role="alert">
            CaneGuard could not confirm an existing session. You may retry sign-in.
          </p>
        ) : null}

        <form className="login-form" onSubmit={submit}>
          <label htmlFor="email">
            <span>Email</span>
            <input
              autoComplete="username"
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label htmlFor="password">
            <span>Password</span>
            <span className="password-input">
              <LockKeyhole aria-hidden="true" />
              <input
                autoComplete="current-password"
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </button>
            </span>
          </label>
          {errorMessage ? (
            <p className="form-error" role="alert">{errorMessage}</p>
          ) : null}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="login-support">
          No public registration is available. Contact the CaneGuard administrator
          if you need workspace access.
        </p>
      </section>
      <aside className="login-visual" aria-label="CaneGuard decision support">
        <div>
          <p className="eyebrow">Decision support for local teams</p>
          <h2>Turn field observations into timely municipal follow-up.</h2>
          <p>
            Securely review submitted evidence, coordinate validation, and keep
            sugarcane monitoring work visible.
          </p>
        </div>
      </aside>
    </main>
  );
}
