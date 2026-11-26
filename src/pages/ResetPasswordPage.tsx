import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useSearchParams } from "react-router";
import { ApiError } from "../api/ApiError";
import { resetPasswordRequest } from "../auth/auth.api";
import type { PasswordResetCredentials } from "../auth/auth.types";
import { Button } from "../components/ui/Button";
import { PasswordInput } from "../components/ui/FormControls";
import { AuthPageFrame } from "./AuthPageFrame";
import { SignInHandoff } from "./MobileSignInHandoff";
import type { LocaleHint, SignInSurface } from "./MobileSignInHandoff";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<PasswordResetCredentials>({
    email: searchParams.get("email") ?? "",
    token: searchParams.get("token") ?? "",
    password: "",
    password_confirmation: "",
  });
  const [isSubmitting, setSubmitting] = useState(false);
  const [reset, setReset] = useState<{ surface?: SignInSurface; locale?: LocaleHint } | null>(null);
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
      const result = await resetPasswordRequest(form);
      setReset({ surface: result.sign_in_surface, locale: result.locale_hint });
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
      {reset ? (
        <SignInHandoff kind="reset" surface={reset.surface} locale={reset.locale} />
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
            <PasswordInput
              autoComplete="new-password"
              name="password"
              value={form.password}
              minLength={15}
              maxLength={128}
              onChange={(event) => update("password", event.target.value)}
              required
            />
          </label>
          <label>
            <span>Confirm password</span>
            <PasswordInput
              autoComplete="new-password"
              name="password_confirmation"
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
          <p className="auth-form__hint" lang="tl">
            Gumamit ng 3 madaling salita (hal. tubo sa bukid 2026) — 15 letra o higit pa, walang kailangang simbolo.
          </p>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Updating password..." : "Update password"}
          </Button>
        </form>
      )}
    </AuthPageFrame>
  );
}
