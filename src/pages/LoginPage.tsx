import { useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import caneGuardLogoFlat from "../assets/brand/CaneGuard_logo_flat.svg";
import caneGuardLogoFlatOnDark from "../assets/brand/CaneGuard_logo_flat_onDark.svg";
import farmHero from "../assets/hero.png";
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
  const [requiresVerification, setRequiresVerification] = useState(false);

  if (auth.status === "loading") {
    return (
      <main className="login-page login-page--portal">
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
    setRequiresVerification(false);

    try {
      await auth.login({ email, password });
      navigate(destination, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrorMessage("The email or password is incorrect.");
      } else if (error instanceof ApiError && error.code === "ACCOUNT_DISABLED") {
        setErrorMessage("Account disabled — contact your administrator.");
      } else if (error instanceof ApiError && error.status === 429) {
        setErrorMessage(
          "Too many sign-in attempts. Wait a minute before trying again.",
        );
      } else if (
        error instanceof ApiError &&
        error.code === "EMAIL_NOT_VERIFIED"
      ) {
        setErrorMessage("Verify your email address before signing in.");
        setRequiresVerification(true);
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
      : routeState.reason === "account_disabled"
        ? "Account disabled — contact your administrator."
      : routeState.reason === "access_denied"
        ? "This account is not authorized for the SRA Don Pedro Web workspace. Ask your district office administrator to request office access from the CaneGuard operator."
        : null;

  return (
    <main className="login-page login-page--portal">
      <aside className="login-visual" aria-label="CaneGuard decision support">
        <img
          src={farmHero}
          alt=""
          aria-hidden="true"
          className="login-visual__farm-image"
        />
        <div className="login-visual__hero">
          <div className="login-visual__hero-frame">
            <img
              src={caneGuardLogoFlatOnDark}
              alt="CaneGuard"
              className="login-visual__hero-logo"
            />
          </div>
          <p className="login-visual__tagline">
            Sugarcane monitoring &amp; field verification
          </p>
          <p className="login-visual__access">
            SRA Don Pedro staff only — sign in with your office-issued credentials. New inspectors request access through the district office.
          </p>
          <p className="login-visual__access">
            No office account yet? Ask your district office administrator to request one
            from the CaneGuard operator; provide your full name, work email and the role
            you need. Public sign-up is not available.
          </p>
        </div>
      </aside>

      <section className="login-panel" aria-labelledby="login-heading">
        <div className="login-brand login-brand--hero">
          <img
            src={caneGuardLogoFlat}
            alt="CaneGuard"
            className="login-brand__logo"
          />
        </div>

        <div className="login-card__header">
          <span className="login-card__badge">Staff Portal</span>
        </div>

        <div className="login-copy">
          <h1 id="login-heading">Sign in to review field reports</h1>
          <p className="login-subtitle">Sign in with your SRA Don Pedro staff account.</p>
        </div>

        <div className="login-notice-slot" aria-live="polite">
          {routeMessage ? (
            <p className="login-notice" role="status">{routeMessage}</p>
          ) : null}
          {auth.status === "service_error" ? (
            <p className="login-notice login-notice--error" role="alert">
              CaneGuard could not confirm an existing session. You may retry sign-in.
            </p>
          ) : null}
          {errorMessage ? (
            <p className="login-notice login-notice--error" role="alert">{errorMessage}</p>
          ) : null}
          {requiresVerification ? (
            <Link className="login-notice__link" to={routes.verifyEmail}>
              Resend verification email
            </Link>
          ) : null}
        </div>

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
          <div className="login-form__actions">
            <Link className="auth-inline-link" to={routes.forgotPassword}>
              Forgot password?
            </Link>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </div>
        </form>

      </section>
    </main>
  );
}
