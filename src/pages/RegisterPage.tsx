import { useState } from "react";
import { UserPlus } from "lucide-react";
import { ApiError } from "../api/ApiError";
import { routes } from "../app/routes";
import { registerRequest } from "../auth/auth.api";
import type { RegistrationCredentials } from "../auth/auth.types";
import { Button } from "../components/ui/Button";
import { AccessConfiguration } from "../components/AccessConfiguration";
import { AuthPageFrame } from "./AuthPageFrame";

export function RegisterPage() {
  const [form, setForm] = useState<RegistrationCredentials>({
    name: "",
    email: "",
    password: "",
    password_confirmation: "",
  });
  const [isSubmitting, setSubmitting] = useState(false);
  const [isCreated, setCreated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const update = (field: keyof RegistrationCredentials, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await registerRequest(form);
      setCreated(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrorMessage(
          error.errors?.email?.[0] ??
            error.errors?.password?.[0] ??
            error.errors?.password_confirmation?.[0] ??
            "Check the account details and try again.",
        );
      } else if (error instanceof ApiError && error.code === "REGISTRATION_DISABLED") {
        setErrorMessage("Registration is disabled. Contact the office for an approved staff invitation.");
      } else if (error instanceof ApiError && error.status === 429) {
        setErrorMessage("Too many registration attempts. Wait a minute and try again.");
      } else {
        setErrorMessage(
          "The CaneGuard service is unavailable. Your account was not confirmed.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthPageFrame
      headingId="register-heading"
      eyebrow="Account registration"
      title="Create your account"
      description="Registration creates a farmer account, not inspector access. Staff access requires an approved office roster and invitation."
      icon={<UserPlus aria-hidden="true" />}
    >
      <AccessConfiguration />
      {isCreated ? (
        <div className="auth-success" role="status">
          <strong>Account created.</strong>
          <span>Check your email to verify the address. Verification does not grant staff access.</span>
          <a className="button button--primary" href={routes.verifyEmail}>
            Continue to verification
          </a>
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
            <span>Name</span>
            <input
              autoComplete="name"
              name="name"
              type="text"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              required
            />
          </label>
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
            <span>Password</span>
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
            {isSubmitting ? "Creating account..." : "Create account"}
          </Button>
        </form>
      )}
    </AuthPageFrame>
  );
}
