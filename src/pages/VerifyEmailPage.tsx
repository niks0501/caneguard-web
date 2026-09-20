import { useEffect, useState } from "react";
import { CircleCheck, MailCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { ApiError } from "../api/ApiError";
import { resendVerificationRequest, verifyEmailRequest } from "../auth/auth.api";
import { routes } from "../app/routes";
import { Button } from "../components/ui/Button";
import { AuthPageFrame } from "./AuthPageFrame";

type VerificationState = "idle" | "loading" | "verified" | "invalid";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const hash = searchParams.get("hash");
  const expires = searchParams.get("expires");
  const signature = searchParams.get("signature");
  const hasVerificationLink = Boolean(id && hash && expires && signature);
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [verificationState, setVerificationState] = useState<VerificationState>(
    hasVerificationLink ? "loading" : "idle",
  );
  const [resendSent, setResendSent] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !hash || !expires || !signature) return;
    let cancelled = false;

    void verifyEmailRequest(id, hash, { expires, signature })
      .then(() => {
        if (!cancelled) setVerificationState("verified");
      })
      .catch(() => {
        if (!cancelled) setVerificationState("invalid");
      });

    return () => {
      cancelled = true;
    };
  }, [expires, hash, id, signature]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setResendSent(false);

    try {
      await resendVerificationRequest(email);
      setResendSent(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        setErrorMessage("Too many verification requests. Wait a minute and try again.");
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
      headingId="verify-email-heading"
      eyebrow="Email verification"
      title={verificationState === "verified" ? "Email verified" : "Verify your email address"}
      description="A verified email keeps field-report access connected to the right account."
      icon={
        verificationState === "verified" ? (
          <CircleCheck aria-hidden="true" />
        ) : (
          <MailCheck aria-hidden="true" />
        )
      }
    >
      {verificationState === "loading" ? (
        <p className="auth-loading" role="status">Confirming your verification link...</p>
      ) : verificationState === "verified" ? (
        <div className="auth-success" role="status">
          <strong>Your email is verified.</strong>
          <span>You can now sign in to continue.</span>
          <Link className="button button--primary" to={routes.login}>
            Return to sign in
          </Link>
        </div>
      ) : (
        <>
          {verificationState === "invalid" ? (
            <p className="auth-error" role="alert">
              This verification link is invalid or expired. Request a fresh link below.
            </p>
          ) : null}
          <form className="login-form auth-form" onSubmit={submit}>
            <div className="auth-form__notice" aria-live="polite">
              {errorMessage ? (
                <p className="login-notice login-notice--error" role="alert">
                  {errorMessage}
                </p>
              ) : null}
              {resendSent ? (
                <p className="login-notice" role="status">
                  If the address is eligible, a verification link will be sent.
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
              {isSubmitting ? "Sending link..." : "Resend verification link"}
            </Button>
          </form>
        </>
      )}
    </AuthPageFrame>
  );
}
