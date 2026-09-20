import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { ApiError } from "../api/ApiError";
import { resetPasswordRequest } from "../auth/auth.api";
import type { PasswordResetCredentials } from "../auth/auth.types";
import { routes } from "../app/routes";
import { Button } from "../components/ui/Button";
import { AuthPageFrame } from "./AuthPageFrame";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<PasswordResetCredentials>({
    email: searchParams.get("email") ?? "",
    token: searchParams.get("token") ?? "",
    password: "",
    password_confirmation: "",
  });
  const [isSubmitting, setSubmitting] = useState(false);
  const [isReset, setReset] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const update = (
    field: "email" | "password" | "password_confirmation",
    value: string,
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await resetPasswordRequest(form);
      setReset(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrorMessage("This recovery link is invalid, expired, or already used.");
      } else {
        setErrorMessage(
          "The CaneGuard service is unavailable. Please try again later.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthPageFrame
      headingId="reset-password-heading"
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Use the one-time recovery link from your email to secure your account again."
      icon={<KeyRound aria-hidden="true" />}
    >
      {isReset ? (
        <div className="auth-success" role="status">
          <strong>Password updated.</strong>
          <span>All existing sessions were signed out. Sign in again with the new password.</span>
          <Link className="button button--primary" to={routes.login}>
            Return to sign in
          </Link>
        </div>
      ) : !form.token ? (
        <div className="auth-error" role="alert">
          This recovery link is missing its one-time value. Request a new link to continue.
        </div>
      ) : (
        <form className="login-form auth-form" onSubmit={submit}>
          <div className="auth-form__notice" aria-live="polite">
            {errorMessage ? (
              <p className="login-notice login-notice--error" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </div>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              name="email"
              type="email"
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              required
            />
          </label>
          <label>
            <span>New password</span>
            <input
              autoComplete="new-password"
              name="password"
              type="password"
              value={form.password}
              minLength={15}
              maxLength={128}
              onChange={(event) => update("password", event.target.value)}
              required
            />
          </label>
          <label>
            <span>Confirm password</span>
            <input
              autoComplete="new-password"
              name="password_confirmation"
              type="password"
              value={form.password_confirmation ?? ""}
              minLength={15}
              maxLength={128}
              onChange={(event) => update("password_confirmation", event.target.value)}
              required
            />
          </label>
          <p className="auth-form__hint">
            Use 15 to 128 characters. A phrase is fine; no symbol or number pattern is required.
          </p>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Updating password..." : "Update password"}
          </Button>
        </form>
      )}
    </AuthPageFrame>
  );
}
