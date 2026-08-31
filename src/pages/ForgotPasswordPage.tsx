import { useState } from "react";
import { Mail } from "lucide-react";
import { ApiError } from "../api/ApiError";
import { forgotPasswordRequest } from "../auth/auth.api";
import { Button } from "../components/ui/Button";
import { AuthPageFrame } from "./AuthPageFrame";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);
  const [isSent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await forgotPasswordRequest(email);
      setSent(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setErrorMessage("Too many recovery attempts. Wait a minute and try again.");
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
      headingId="forgot-password-heading"
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your account email and we will send recovery instructions if it matches an account."
      icon={<Mail aria-hidden="true" />}
    >
      {isSent ? (
        <div className="auth-success" role="status">
          <strong>Check your email.</strong>
          <span>
            If an account matches, a password recovery link will be sent. The link expires in one hour.
          </span>
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending instructions..." : "Send recovery link"}
          </Button>
        </form>
      )}
    </AuthPageFrame>
  );
}
