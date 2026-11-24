import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { ApiError } from "../../api/ApiError";
import { Button } from "../../components/ui/Button";
import { PasswordInput } from "../../components/ui/FormControls";
import { changeEmail } from "../../services/account.api";

export function EmailSettings() {
  const [emailPassword, setEmailPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [isEmailSubmitting, setEmailSubmitting] = useState(false);

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isEmailSubmitting) return;
    setEmailError(null);
    setEmailSuccess(null);

    if (!emailPassword) {
      setEmailError("Enter your current password to verify your identity.");
      return;
    }
    if (!newEmail || !newEmail.includes("@")) {
      setEmailError("Enter a valid new email address.");
      return;
    }

    setEmailSubmitting(true);
    try {
      const result = await changeEmail({
        currentPassword: emailPassword,
        email: newEmail,
      });
      setEmailSuccess(
        result.message ||
          "Email updated. Verify the new address before signing in again.",
      );
      setEmailPassword("");
      setNewEmail("");
    } catch (error) {
      setEmailError(
        error instanceof ApiError ? error.message : "Failed to update email address.",
      );
    } finally {
      setEmailSubmitting(false);
    }
  };

  return (
    <section className="settings-card" aria-labelledby="email-heading">
      <div className="section-heading">
        <h2 id="email-heading">Change email address</h2>
        <Mail aria-hidden="true" />
      </div>

      {emailError ? (
        <div className="govuk-error-summary" role="alert" tabIndex={-1}>
          <h2 className="govuk-error-summary__title">There is a problem</h2>
          <div className="govuk-error-summary__body">
            <ul className="govuk-error-summary__list">
              <li>{emailError}</li>
            </ul>
          </div>
        </div>
      ) : null}

      {emailSuccess ? (
        <div className="settings-alert settings-alert--success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span>{emailSuccess}</span>
        </div>
      ) : null}

      <form onSubmit={handleEmailSubmit} className="settings-form">
        <div className="settings-field-row">
          <label className="settings-field">
            <span>Current password (for verification)</span>
            <PasswordInput
              autoComplete="current-password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              required
            />
          </label>

          <label className="settings-field">
            <span>New email address</span>
            <input
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
          </label>
        </div>

        <div className="settings-form__actions">
          <Button type="submit" disabled={isEmailSubmitting}>
            {isEmailSubmitting ? "Updating email..." : "Update email"}
          </Button>
        </div>
      </form>
    </section>
  );
}
